import { localStorage, LAB_PREFIX } from '../../lab/storage';
import type { BeamMessage, BeamPeerState, BeamTransferState, BeamTransport } from '../types';
import {
  BEAM_CHANNEL_NAME, BEAM_STORAGE_KEY, EMPTY_PEER, EMPTY_TRANSFER, HANDSHAKE_INTERVAL_MS,
  MAX_FILE_BYTES, MAX_SEEN_MESSAGES, PEER_TIMEOUT_MS, PING_INTERVAL_MS, SSE_SINCE,
  BeamSendError, arrayBufferToBase64, base64ToArrayBuffer, buildBeamLink, computeSha256,
  formatRoomCode, generateNewReceiverRoomCode, generateRoomCode, getDeviceLabel,
  getPersistentReceiverRoomCode, getRecentRooms, looksLikePdfBuffer, mergeArrayBuffers,
  parseBeamLaunch, randomId, saveRecentRoom,
  type BeamConnectionStatus, type BeamLaunchParams, type BeamLaunchRole,
  type BeamSendErrorCode, type FileCompletion, type IncomingFileState,
  type LocalDocState, type SendDocumentOptions,
} from './beamUtils';
import {
  downloadChunksViaRelay, extractMessagesFromRelayEvent, fetchRelayAttachmentBuffer,
  fetchRelayAttachmentText, publishRelayMessage, putRelayAttachment, uploadAndBroadcastViaRelay,
  type RelayAttachmentPayload,
} from './beamRelayTransport';
import { dispatchReceiverBeamMessage, dispatchSenderBeamMessage, type BeamProtocolHost } from './beamProtocolHandlers';
import {
  beginBeamIncomingFile, bindBeamDataChannel, closeBeamRtcPeer, createBeamPeerConnection,
  finishBeamIncomingFile, handleBeamRtcAnswer, handleBeamRtcIce, handleBeamRtcOffer,
  initiateBeamRtc, processDataChannelPayload, sendFileOverBeamChannel,
  type BeamWebRtcHost, type BeamWebRtcState,
} from './beamWebRtcTransport';
import {
  closeBeamEventSource, executeBeamSendDocument, openBeamEventSource, pollBeamRoom,
  processBeamRelayEvent, scheduleBeamReconnect, waitForOpenBeamDataChannel,
  waitUntilBeamPeerConnected, type BeamSignalingHost, type BeamSignalingState,
} from './beamSignalingTransport';

export type {
  BeamConnectionStatus, BeamLaunchRole, BeamLaunchParams, BeamSendErrorCode, SendDocumentOptions,
};

export {
  BeamSendError, generateRoomCode, getPersistentReceiverRoomCode, generateNewReceiverRoomCode,
  formatRoomCode, parseBeamLaunch, buildBeamLink, arrayBufferToBase64, base64ToArrayBuffer,
  computeSha256, looksLikePdfBuffer, mergeArrayBuffers, getRecentRooms, saveRecentRoom,
};

const RTC_RETRY_MS = 6000;
const RTC_MAX_ATTEMPTS = 4;

/** Coordinates local-tab BroadcastChannel, cloud relay SSE/polling, and WebRTC P2P Beam sessions. */
export class BeamService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners = new Set<(msg: BeamMessage, transport: BeamTransport) => void | Promise<void>>();
  private stateListeners = new Set<(state: { room: string | null; role: 'receiver' | 'sender' | null }) => void>();
  private statusListeners = new Set<(status: BeamConnectionStatus) => void>();
  private peerListeners = new Set<(state: BeamPeerState) => void>();
  private transferListeners = new Set<(state: BeamTransferState) => void>();

  private sigState: BeamSignalingState = {
    activeEventSource: null, activeRoomCode: null, connectedRoom: null, role: null,
    connectionStatus: 'disconnected', sessionId: null, relayCursor: SSE_SINCE,
    pollingGeneration: null, reconnectAttempt: 0, sourceGeneration: 0,
    reconnectTimer: null, connectionTimer: null, pollTimer: null,
  };
  private lastNotifiedState = '';
  private readonly deviceId = randomId('d');
  private peerSessionId: string | null = null;
  private closedSessions = new Set<string>();
  private localDoc: LocalDocState = { title: null, page: 1, total: 0 };
  private peerState: BeamPeerState = { ...EMPTY_PEER };
  private transferState: BeamTransferState = { ...EMPTY_TRANSFER };

  private rtcState: BeamWebRtcState = {
    isRtcSupported: typeof RTCPeerConnection !== 'undefined', rtcPeer: null,
    rtcDataChannel: null, remoteDescriptionSet: false, queuedIce: [],
    rtcAttempt: 0, lastOfferSdp: null, incomingFile: null,
  };
  private rtcRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private maintenanceTimer: number | null = null;
  private lastPeerSeen = 0;
  private lastPingAt = 0;
  private seenMessages = new Map<string, number>();
  private lastPageBroadcast = { page: 0, at: 0 };
  private sendingDocument = false;
  private fileCompletion: FileCompletion | null = null;
  private fileCompletionId: string | null = null;

  private get activeRoomCode(): string | null { return this.sigState.activeRoomCode; }
  private set activeRoomCode(v: string | null) { this.sigState.activeRoomCode = v; }
  private get connectedRoom(): string | null { return this.sigState.connectedRoom; }
  private set connectedRoom(v: string | null) { this.sigState.connectedRoom = v; }
  private get role(): 'receiver' | 'sender' | null { return this.sigState.role; }
  private set role(v: 'receiver' | 'sender' | null) { this.sigState.role = v; }
  private get sessionId(): string | null { return this.sigState.sessionId; }
  private set sessionId(v: string | null) { this.sigState.sessionId = v; }
  private get relayCursor(): string { return this.sigState.relayCursor; }
  private set relayCursor(v: string) { this.sigState.relayCursor = v; }
  private get sourceGeneration(): number { return this.sigState.sourceGeneration; }
  private get isRtcSupported(): boolean { return this.rtcState.isRtcSupported; }
  private set isRtcSupported(v: boolean) { this.rtcState.isRtcSupported = v; }
  private get rtcPeer(): RTCPeerConnection | null { return this.rtcState.rtcPeer; }
  private set rtcPeer(v: RTCPeerConnection | null) { this.rtcState.rtcPeer = v; }
  private get rtcDataChannel(): RTCDataChannel | null { return this.rtcState.rtcDataChannel; }
  private set rtcDataChannel(v: RTCDataChannel | null) { this.rtcState.rtcDataChannel = v; }
  /** @internal White-box accessor used by unit tests. */
  public get incomingFile(): IncomingFileState | null { return this.rtcState.incomingFile; }
  /** @internal White-box accessor used by unit tests. */
  public set incomingFile(v: IncomingFileState | null) { this.rtcState.incomingFile = v; }

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BEAM_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          const msg = event.data as BeamMessage | undefined;
          if (msg) void this.handleIncoming(msg, 'local');
        };
      } catch (error) {
        console.warn('BroadcastChannel not available, using fallback:', error);
      }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (event) => {
        if (event.key === `${LAB_PREFIX}${BEAM_STORAGE_KEY}` && event.newValue) {
          try {
            void this.handleIncoming(JSON.parse(event.newValue) as BeamMessage, 'local');
          } catch {}
        }
      });
      window.addEventListener('online', () => this.retryCloudConnection());
      window.addEventListener('offline', () => {
        if (this.connectedRoom) this.setConnectionStatus('connecting');
      });
    }
  }

  public getDeviceId(): string { return this.deviceId; }
  public isOwnMessage(msg: BeamMessage): boolean { return Boolean(msg.origin && msg.origin === this.deviceId); }
  public normalizeRoom(code: string): string { return code.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
  public isMatchingRoom(a: string, b: string): boolean {
    const cleanA = this.normalizeRoom(a);
    return cleanA.length > 0 && cleanA === this.normalizeRoom(b);
  }
  public getConnectedRoom(): string | null { return this.connectedRoom; }
  public getRole(): 'receiver' | 'sender' | null { return this.role; }
  public getConnectionStatus(): BeamConnectionStatus { return this.sigState.connectionStatus; }
  public getPeerState(): BeamPeerState { return { ...this.peerState }; }
  public getTransferState(): BeamTransferState { return { ...this.transferState }; }
  public getLocalDocumentState(): LocalDocState { return { ...this.localDoc }; }

  public retryCloudConnection(): void {
    if (!this.connectedRoom || !this.activeRoomCode || !this.role) return;
    this.sigState.reconnectAttempt = 0;
    this.closeEventSource();
    this.setConnectionStatus('connecting');
    this.openEventSource();
    if (this.role === 'sender') this.sendHandshake();
  }

  public startReceiver(roomCode: string, force = false): void {
    this.startSession('receiver', roomCode, force);
  }

  public startSender(roomCode: string, force = false): void {
    this.startSession('sender', roomCode, force);
    if (formatRoomCode(roomCode)) this.sendHandshake();
  }

  private startSession(role: 'receiver' | 'sender', roomCode: string, force: boolean): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;
    saveRecentRoom(formatted);
    if (!force && this.connectedRoom === formatted && this.role === role) {
      if (this.sigState.connectionStatus !== 'connected') this.openEventSource();
      return;
    }
    this.closeRtc();
    this.closeEventSource();
    this.stopMaintenance();
    this.resetTransfer();
    this.resetPeer();
    this.connectedRoom = formatted;
    this.role = role;
    this.sessionId = role === 'sender' ? randomId('s') : null;
    this.peerSessionId = null;
    this.closedSessions.clear();
    this.lastPeerSeen = 0;
    this.sigState.reconnectAttempt = 0;
    this.relayCursor = SSE_SINCE;
    this.seenMessages.clear();
    this.notifyStateListeners();
    this.setConnectionStatus('connecting');
    this.listenToRoom(formatted);
    this.startMaintenance();
  }

  public disconnect(): void {
    this.sendDisconnectBestEffort();
    this.finishDisconnect();
  }

  private addObserver<T>(set: Set<T>, cb: T, emit?: () => void): () => void {
    set.add(cb);
    emit?.();
    return () => { set.delete(cb); };
  }

  public onConnectionStatusChange(cb: (status: BeamConnectionStatus) => void): () => void {
    return this.addObserver(this.statusListeners, cb, () => cb(this.sigState.connectionStatus));
  }
  public onStateChange(cb: (state: { room: string | null; role: 'receiver' | 'sender' | null }) => void): () => void {
    return this.addObserver(this.stateListeners, cb, () => cb({ room: this.connectedRoom, role: this.role }));
  }
  public onPeerChange(cb: (state: BeamPeerState) => void): () => void {
    return this.addObserver(this.peerListeners, cb, () => cb({ ...this.peerState }));
  }
  public onTransferProgress(cb: (state: BeamTransferState) => void): () => void {
    return this.addObserver(this.transferListeners, cb, () => cb({ ...this.transferState }));
  }
  public subscribe(cb: (msg: BeamMessage, transport: BeamTransport) => void | Promise<void>): () => void {
    return this.addObserver(this.listeners, cb);
  }

  public setLocalDocumentState(docTitle: string, currentPage: number, totalPages: number): void {
    this.localDoc = { title: docTitle || null, page: currentPage || 1, total: totalPages || 0 };
    if (this.role === 'receiver' && this.connectedRoom && this.peerSessionId) {
      this.announceState(docTitle, currentPage, totalPages);
    }
  }

  public broadcastPageChange(pageNumber: number): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId || !this.peerSessionId) return;
    const page = Math.max(1, Math.round(pageNumber));
    const now = Date.now();
    if (this.lastPageBroadcast.page === page && now - this.lastPageBroadcast.at < 600) return;
    this.lastPageBroadcast = { page, at: now };
    void this.broadcast({
      type: 'BEAM_PAGE_CHANGE', roomCode: this.connectedRoom, sessionId: this.sessionId,
      pageNumber: page, timestamp: now,
    });
  }

  private sendSenderCommand(type: 'BEAM_STEP' | 'BEAM_VIEW_MODE' | 'BEAM_QUERY_STATE', patch: Partial<BeamMessage>, roomOverride?: string): void {
    const room = roomOverride || this.connectedRoom;
    if (!room || this.role !== 'sender' || !this.sessionId) return;
    void this.broadcast({ type, roomCode: room, sessionId: this.sessionId, timestamp: Date.now(), ...patch });
  }

  public sendStep(direction: 'next' | 'prev'): void { this.sendSenderCommand('BEAM_STEP', { direction }); }
  public sendViewMode(viewMode: 'continuous' | 'dual' | 'single'): void { this.sendSenderCommand('BEAM_VIEW_MODE', { viewMode }); }
  public queryReceiverState(roomCode?: string): void { this.sendSenderCommand('BEAM_QUERY_STATE', {}, roomCode); }

  public announceState(docTitle?: string | null, pageNumber?: number, totalPages?: number): void {
    if (!this.connectedRoom || (this.role === 'receiver' && !this.peerSessionId)) return;
    void this.broadcast({
      type: 'BEAM_STATE_ANNOUNCE',
      roomCode: this.connectedRoom,
      sessionId: this.role === 'receiver' ? this.peerSessionId || undefined : this.sessionId || undefined,
      receiverName: getDeviceLabel(),
      docTitle: (docTitle ?? this.localDoc.title ?? undefined) || undefined,
      pageNumber: pageNumber ?? this.localDoc.page ?? 1,
      totalPages: totalPages ?? this.localDoc.total ?? 1,
      timestamp: Date.now(),
    });
  }

  public async sendDocument(options: SendDocumentOptions): Promise<{ mode: BeamTransport }> {
    return executeBeamSendDocument({
      sigState: this.sigState,
      isSendingDocument: () => this.sendingDocument,
      setSendingDocument: (v) => { this.sendingDocument = v; },
      startSender: (r, f) => this.startSender(r, f),
      isPeerConnected: () => this.peerState.connected,
      isRtcSupported: () => this.isRtcSupported,
      updateTransfer: (p) => this.updateTransfer(p),
      waitForPeer: (ms) => this.waitForPeer(ms),
      waitForDataChannel: (ms) => this.waitForDataChannel(ms),
      sendFileOverDataChannel: (o) => this.sendFileOverDataChannel(o),
      sendFileOverRelay: (o) => this.sendFileOverRelay(o),
    }, options);
  }

  public async downloadRelayChunks(chunks: string[], expectedSize?: number, expectedSha256?: string): Promise<ArrayBuffer> {
    return downloadChunksViaRelay({
      chunks, expectedSize, expectedSha256,
      fetchChunk: (url, maxBytes) => this.fetchAttachmentBuffer(url, maxBytes),
      onTransferPatch: (patch) => this.updateTransfer(patch),
    });
  }

  public async downloadRelayDocument(url: string): Promise<ArrayBuffer> {
    return this.fetchAttachmentBuffer(url, MAX_FILE_BYTES);
  }

  public async broadcast(message: BeamMessage): Promise<void> {
    const outgoing: BeamMessage = {
      ...message, msgId: message.msgId || randomId('m'),
      origin: message.origin || this.deviceId, timestamp: message.timestamp || Date.now(),
    };
    this.rememberMessage(outgoing);

    if (!outgoing.type.startsWith('BEAM_RTC_') && this.rtcDataChannel?.readyState === 'open') {
      try {
        this.rtcDataChannel.send(JSON.stringify(outgoing));
        if (outgoing.type !== 'BEAM_DISCONNECT') return;
      } catch (error) {
        console.debug('P2P channel send note, relay fallback active:', error);
      }
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.postMessage(outgoing); } catch {}
    }
    try { localStorage.setItem(BEAM_STORAGE_KEY, JSON.stringify(outgoing)); } catch {}
    await this.publishMessage(outgoing);
  }

  private setConnectionStatus(status: BeamConnectionStatus): void {
    if (this.sigState.connectionStatus === status) return;
    this.sigState.connectionStatus = status;
    this.statusListeners.forEach((l) => { try { l(status); } catch {} });
  }

  private notifyStateListeners(): void {
    const state = { room: this.connectedRoom, role: this.role };
    const serialized = `${state.room || ''}|${state.role || ''}`;
    if (serialized === this.lastNotifiedState) return;
    this.lastNotifiedState = serialized;
    this.stateListeners.forEach((l) => { try { l(state); } catch {} });
  }

  private notifyPeerListeners(): void {
    const snap = { ...this.peerState };
    this.peerListeners.forEach((l) => { try { l(snap); } catch {} });
  }

  private notifyTransferListeners(): void {
    const snap = { ...this.transferState };
    this.transferListeners.forEach((l) => { try { l(snap); } catch {} });
  }

  private updateTransfer(patch: Partial<BeamTransferState>): void {
    this.transferState = { ...this.transferState, ...patch };
    this.notifyTransferListeners();
  }

  private resetTransfer(): void {
    this.resolveFileCompletion(new Error('Transfer cancelled.'));
    this.transferState = { ...EMPTY_TRANSFER };
    this.notifyTransferListeners();
  }

  private resetPeer(): void {
    this.peerState = { ...EMPTY_PEER };
    this.notifyPeerListeners();
  }

  private setPeerConnected(connected: boolean, peerName?: string | null): void {
    const changed = this.peerState.connected !== connected || (peerName !== undefined && this.peerState.peerName !== peerName);
    this.peerState = {
      ...this.peerState, connected,
      peerName: peerName !== undefined ? peerName : this.peerState.peerName,
      transport: connected ? this.peerState.transport || (this.rtcDataChannel?.readyState === 'open' ? 'p2p' : 'relay') : null,
    };
    if (changed) this.notifyPeerListeners();
  }

  private setPeerTransport(transport: BeamTransport | null): void {
    if (this.peerState.transport === transport) return;
    this.peerState = { ...this.peerState, transport };
    this.notifyPeerListeners();
  }

  private setPeerDocument(docTitle: string | null | undefined, pageNumber: number | null | undefined, totalPages: number | null | undefined): void {
    this.peerState = {
      ...this.peerState,
      docTitle: docTitle !== undefined ? docTitle : this.peerState.docTitle,
      pageNumber: pageNumber !== undefined ? pageNumber : this.peerState.pageNumber,
      totalPages: totalPages !== undefined ? totalPages : this.peerState.totalPages,
    };
    this.notifyPeerListeners();
  }

  private signalingHost(): BeamSignalingHost {
    return {
      state: this.sigState,
      setConnectionStatus: (s) => this.setConnectionStatus(s),
      closeEventSource: () => this.closeEventSource(),
      openEventSource: () => this.openEventSource(),
      pollRoom: (g) => this.pollRoom(g),
      scheduleReconnect: (g) => this.scheduleReconnect(g),
      handleRelayEvent: (raw, g) => this.handleRelayEvent(raw, g),
      extractRelayMessages: (p) => this.extractRelayMessages(p),
      handleIncoming: (m, t) => this.handleIncoming(m, t),
      sendHandshake: () => this.sendHandshake(),
    };
  }

  private listenToRoom(roomCode: string): void {
    this.activeRoomCode = roomCode;
    this.openEventSource();
  }
  private openEventSource(): void { openBeamEventSource(this.signalingHost()); }
  private closeEventSource(): void { closeBeamEventSource(this.sigState); }
  private async pollRoom(generation: number): Promise<void> { await pollBeamRoom(this.signalingHost(), generation); }
  private scheduleReconnect(generation: number): void { scheduleBeamReconnect(this.signalingHost(), generation); }
  private async handleRelayEvent(raw: string, generation = this.sourceGeneration): Promise<void> {
    await processBeamRelayEvent(this.signalingHost(), raw, generation);
  }

  private startMaintenance(): void {
    this.stopMaintenance();
    if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;
    this.maintenanceTimer = window.setInterval(() => {
      if (!this.connectedRoom) return;
      const now = Date.now();
      if (this.peerState.connected && this.lastPeerSeen > 0 && now - this.lastPeerSeen > PEER_TIMEOUT_MS) {
        this.closeRtc();
        this.resetPeer();
        if (this.role === 'receiver') this.peerSessionId = null;
      }
      if (this.role === 'sender') {
        if (!this.peerState.connected) this.sendHandshake();
        else if (now - this.lastPingAt >= PING_INTERVAL_MS) this.sendPing();
      }
    }, HANDSHAKE_INTERVAL_MS);
  }

  private stopMaintenance(): void {
    if (this.maintenanceTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  private sendHandshake(): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId) return;
    void this.broadcast({
      type: 'BEAM_HANDSHAKE', roomCode: this.connectedRoom, sessionId: this.sessionId,
      senderName: getDeviceLabel(), timestamp: Date.now(),
    });
  }

  private sendPing(): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId) return;
    this.lastPingAt = Date.now();
    void this.broadcast({
      type: 'BEAM_PING', roomCode: this.connectedRoom, sessionId: this.sessionId, timestamp: this.lastPingAt,
    });
  }

  private sendReady(sessionId: string): void {
    if (!this.connectedRoom || this.role !== 'receiver') return;
    void this.broadcast({
      type: 'BEAM_READY', roomCode: this.connectedRoom, sessionId, receiverName: getDeviceLabel(),
      docTitle: this.localDoc.title || undefined, pageNumber: this.localDoc.page, totalPages: this.localDoc.total,
      timestamp: Date.now(),
    });
  }

  private sendPong(sessionId: string): void {
    if (!this.connectedRoom || this.role !== 'receiver') return;
    void this.broadcast({ type: 'BEAM_PONG', roomCode: this.connectedRoom, sessionId, timestamp: Date.now() });
  }

  private sendDisconnectBestEffort(): void {
    const session = this.role === 'sender' ? this.sessionId : this.peerSessionId;
    if (!this.connectedRoom || !session) return;
    void this.broadcast({ type: 'BEAM_DISCONNECT', roomCode: this.connectedRoom, sessionId: session, timestamp: Date.now() });
  }

  private finishDisconnect(): void {
    this.closeRtc();
    this.closeEventSource();
    this.stopMaintenance();
    this.resetTransfer();
    this.resetPeer();
    this.activeRoomCode = null;
    this.connectedRoom = null;
    this.role = null;
    this.sessionId = null;
    this.peerSessionId = null;
    this.setConnectionStatus('disconnected');
    this.notifyStateListeners();
  }

  private async extractRelayMessages(parsed: Record<string, unknown>): Promise<BeamMessage[]> {
    return extractMessagesFromRelayEvent(parsed as RelayAttachmentPayload, {
      role: this.role, peerSessionId: this.peerSessionId, connectedRoom: this.connectedRoom,
      fetchText: (url) => this.fetchAttachmentText(url),
    });
  }

  private async fetchAttachmentText(url: string): Promise<string> { return fetchRelayAttachmentText(url); }
  private async fetchAttachmentBuffer(url: string, maxBytes = MAX_FILE_BYTES): Promise<ArrayBuffer> {
    return fetchRelayAttachmentBuffer(url, maxBytes);
  }

  private rememberMessage(msg: BeamMessage): boolean {
    if (!msg.msgId) return true;
    if (this.seenMessages.has(msg.msgId)) return false;
    this.seenMessages.set(msg.msgId, Date.now());
    if (this.seenMessages.size > MAX_SEEN_MESSAGES) {
      const oldest = this.seenMessages.keys().next().value;
      if (oldest !== undefined) this.seenMessages.delete(oldest);
    }
    return true;
  }

  private async handleIncoming(message: BeamMessage, transport: BeamTransport): Promise<void> {
    if (!message || !message.roomCode || !this.connectedRoom) return;
    if (!this.isMatchingRoom(message.roomCode, this.connectedRoom) || this.isOwnMessage(message)) return;
    if (!this.rememberMessage(message)) return;
    if (this.role === 'receiver') await dispatchReceiverBeamMessage(this.protocolHost(), message, transport);
    else if (this.role === 'sender') await dispatchSenderBeamMessage(this.protocolHost(), message, transport);
  }

  private protocolHost(): BeamProtocolHost {
    return {
      getSessionId: () => this.sessionId,
      getPeerSessionId: () => this.peerSessionId,
      setPeerSessionId: (id) => { this.peerSessionId = id; },
      isPeerConnected: () => this.peerState.connected,
      hasClosedSession: (id) => this.closedSessions.has(id),
      markSessionClosed: (id) => {
        this.closedSessions.add(id);
        if (this.closedSessions.size > 40) {
          const oldest = this.closedSessions.values().next().value;
          if (oldest !== undefined) this.closedSessions.delete(oldest);
        }
      },
      isCurrentSession: (id) => this.isCurrentSession(id),
      isChannelOpen: () => this.rtcDataChannel?.readyState === 'open',
      setLastPeerSeen: (ts) => { this.lastPeerSeen = ts; },
      setPeerConnected: (c, n) => this.setPeerConnected(c, n),
      setPeerTransport: (t) => this.setPeerTransport(t),
      setPeerDocument: (title, p, t) => this.setPeerDocument(title, p, t),
      closeRtc: () => this.closeRtc(),
      resetTransfer: () => this.resetTransfer(),
      resetPeer: () => this.resetPeer(),
      resetRtcAttempt: () => { this.rtcState.rtcAttempt = 0; },
      hasRtcPeer: () => Boolean(this.rtcPeer),
      initiateRtc: () => this.initiateRtc(),
      handleRtcOffer: (m) => this.handleRtcOffer(m),
      handleRtcAnswer: (m) => this.handleRtcAnswer(m),
      handleRtcIce: (m) => this.handleRtcIce(m),
      sendReady: (id) => this.sendReady(id),
      sendPong: (id) => this.sendPong(id),
      finishDisconnect: () => this.finishDisconnect(),
      deliverDocument: (m, t) => this.deliverDocument(m, t),
      updateTransfer: (p) => this.updateTransfer(p),
      broadcast: (m) => this.broadcast(m),
      notifyListeners: (m, t) => this.notifyListeners(m, t),
      handleFileCompletion: (id, ok, msg) => this.handleFileCompletion(id, ok, msg),
    };
  }

  private rtcHost(): BeamWebRtcHost {
    return {
      state: this.rtcState,
      getRole: () => this.role,
      getConnectedRoom: () => this.connectedRoom,
      getSessionId: () => this.sessionId,
      getPeerSessionId: () => this.peerSessionId,
      getDeviceId: () => this.deviceId,
      isPeerConnected: () => this.peerState.connected,
      createPeerConnection: () => this.createPeerConnection(),
      closeRtc: () => this.closeRtc(),
      scheduleRtcRetry: () => this.scheduleRtcRetry(),
      setupDataChannel: (ch) => this.setupDataChannel(ch),
      broadcast: (m) => this.broadcast(m),
      setPeerTransport: (t) => this.setPeerTransport(t),
      updateTransfer: (p) => this.updateTransfer(p),
      handleIncoming: (m, t) => this.handleIncoming(m, t),
      deliverDocument: (m, t) => this.deliverDocument(m, t),
      handleFileCompletion: (id, ok, msg) => this.handleFileCompletion(id, ok, msg),
      resolveFileCompletion: (err) => this.resolveFileCompletion(err),
      registerCompletion: (id, ms, msg) => this.registerCompletion(id, ms, msg),
      getFileCompletionId: () => this.fileCompletionId,
      handleDataChannelPayload: (d) => this.handleDataChannelPayload(d),
      finishIncomingFile: (id) => this.finishIncomingFile(id),
      beginIncomingFile: (m) => this.beginIncomingFile(m),
      sendDataChannelControl: (m) => this.sendDataChannelControl(m),
    };
  }

  private isCurrentSession(sessionId?: string): boolean {
    if (this.role === 'receiver') return Boolean(sessionId && this.peerSessionId && sessionId === this.peerSessionId);
    return Boolean(sessionId && this.sessionId && sessionId === this.sessionId);
  }

  private notifyListeners(message: BeamMessage, transport: BeamTransport): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(message, transport);
        if (result) void result.catch((error) => console.error('Error in beam listener:', error));
      } catch (error) {
        console.error('Error in beam listener:', error);
      }
    }
  }

  private async deliverDocument(message: BeamMessage, transport: BeamTransport): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const listener of this.listeners) {
      const result = listener(message, transport);
      if (result) pending.push(result);
    }
    if (!pending.length) throw new Error('The receiving reader is not ready. Reopen Receiver and retry.');
    await Promise.all(pending);
    if (!this.isCurrentSession(message.sessionId)) throw new Error('The receiving session was cancelled.');
    this.notifyListeners({ ...message, type: 'BEAM_DOCUMENT_OPENED' }, transport);
  }

  private closeRtc(): void {
    if (this.rtcRetryTimer !== null) {
      clearTimeout(this.rtcRetryTimer);
      this.rtcRetryTimer = null;
    }
    closeBeamRtcPeer(this.rtcState);
  }

  private createPeerConnection(): RTCPeerConnection | null { return createBeamPeerConnection(this.rtcHost()); }

  private scheduleRtcRetry(): void {
    if (this.role !== 'sender' || !this.connectedRoom || !this.peerSessionId) return;
    if (this.rtcState.rtcAttempt >= RTC_MAX_ATTEMPTS || this.rtcRetryTimer !== null) return;
    this.rtcRetryTimer = setTimeout(() => {
      this.rtcRetryTimer = null;
      if (this.role === 'sender' && this.connectedRoom && this.peerSessionId) void this.initiateRtc();
    }, RTC_RETRY_MS);
  }

  private async initiateRtc(): Promise<void> { await initiateBeamRtc(this.rtcHost()); }
  private async handleRtcOffer(message: BeamMessage): Promise<void> { await handleBeamRtcOffer(this.rtcHost(), message); }
  private async handleRtcAnswer(message: BeamMessage): Promise<void> { await handleBeamRtcAnswer(this.rtcState, message); }
  private async handleRtcIce(message: BeamMessage): Promise<void> { await handleBeamRtcIce(this.rtcState, message); }
  private setupDataChannel(channel: RTCDataChannel): void { bindBeamDataChannel(this.rtcHost(), channel); }
  private async handleDataChannelPayload(data: unknown): Promise<void> { await processDataChannelPayload(this.rtcHost(), data); }
  private beginIncomingFile(meta: Parameters<BeamWebRtcHost['beginIncomingFile']>[0]): void {
    beginBeamIncomingFile(this.rtcHost(), meta);
  }
  private async finishIncomingFile(transferId: string): Promise<void> {
    await finishBeamIncomingFile(this.rtcHost(), transferId);
  }

  private sendDataChannelControl(message: Record<string, unknown>): void {
    if (this.rtcDataChannel?.readyState !== 'open') return;
    try { this.rtcDataChannel.send(JSON.stringify(message)); } catch {}
  }

  private registerCompletion(transferId: string, timeoutMs: number, timeoutMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolveFileCompletion(null);
      this.fileCompletionId = transferId;
      const timer = setTimeout(() => {
        if (this.fileCompletionId === transferId) {
          this.fileCompletionId = null;
          this.fileCompletion = null;
          reject(new Error(timeoutMessage));
        }
      }, timeoutMs);
      this.fileCompletion = { resolve, reject, timer };
    });
  }

  private handleFileCompletion(transferId: string, ok: boolean, message?: string): void {
    if (!this.fileCompletion || this.fileCompletionId !== transferId) return;
    const completion = this.fileCompletion;
    this.fileCompletion = null;
    this.fileCompletionId = null;
    clearTimeout(completion.timer);
    if (ok) completion.resolve();
    else completion.reject(new BeamSendError('invalid-document', message || 'The receiver could not open the PDF.'));
  }

  private resolveFileCompletion(error: Error | null): void {
    if (!this.fileCompletion) return;
    const completion = this.fileCompletion;
    this.fileCompletion = null;
    this.fileCompletionId = null;
    clearTimeout(completion.timer);
    if (error) completion.reject(error);
    else completion.resolve();
  }

  private waitForPeer(timeoutMs: number): Promise<boolean> {
    return waitUntilBeamPeerConnected(() => this.peerState.connected, () => this.connectedRoom, timeoutMs);
  }

  private async waitForDataChannel(timeoutMs: number): Promise<RTCDataChannel | null> {
    return waitForOpenBeamDataChannel({
      getDataChannel: () => this.rtcDataChannel, getConnectedRoom: () => this.connectedRoom,
      getRole: () => this.role, hasRtcPeer: () => Boolean(this.rtcPeer),
      isPeerConnected: () => this.peerState.connected, initiateRtc: () => this.initiateRtc(), timeoutMs,
    });
  }

  private async sendFileOverDataChannel(options: SendDocumentOptions): Promise<void> {
    await sendFileOverBeamChannel(this.rtcHost(), options);
  }

  private async sendFileOverRelay(options: SendDocumentOptions): Promise<void> {
    const generation = this.sourceGeneration;
    const session = this.sessionId;
    const room = this.connectedRoom!;
    await uploadAndBroadcastViaRelay({
      connectedRoom: room, sessionId: session, options,
      assertActive: () => {
        if (this.sourceGeneration !== generation || this.sessionId !== session || this.connectedRoom !== room) {
          throw new BeamSendError('transfer-failed', 'Transfer cancelled because the Beam session changed.');
        }
      },
      putChunk: (topic, chunk, filename) => this.putAttachment(topic, chunk, filename),
      onTransferPatch: (patch) => this.updateTransfer(patch),
      registerCompletion: (transferId) =>
        this.registerCompletion(transferId, 60000, 'The receiver did not confirm opening the PDF.'),
      broadcastPayload: (msg) => this.broadcast(msg),
    });
  }

  private async putAttachment(topic: string, data: ArrayBuffer, filename: string): Promise<string> {
    return putRelayAttachment(topic, data, filename);
  }

  private async publishMessage(message: BeamMessage): Promise<boolean> {
    return publishRelayMessage({
      connectedRoom: this.connectedRoom, deviceId: this.deviceId, message,
      onPublishFailed: () => { if (!this.sigState.activeEventSource) this.setConnectionStatus('connecting'); },
    });
  }
}

export const beamService = new BeamService();
