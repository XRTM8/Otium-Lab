import type { BeamMessage, BeamTransferState, BeamTransport } from '../types';
import type { ThemeMode } from '../../core/types';
import {
  ICE_SERVERS,
  MAX_FILE_BYTES,
  P2P_CHUNK_SIZE,
  P2P_HIGH_WATER_MARK,
  computeSha256,
  isPdfHeader,
  mergeBuffers,
  randomId,
  sleep,
  type IncomingFileState,
  type SendDocumentOptions,
} from './beamUtils';

export interface BeamWebRtcState {
  isRtcSupported: boolean;
  rtcPeer: RTCPeerConnection | null;
  rtcDataChannel: RTCDataChannel | null;
  remoteDescriptionSet: boolean;
  queuedIce: RTCIceCandidateInit[];
  rtcAttempt: number;
  lastOfferSdp: string | null;
  incomingFile: IncomingFileState | null;
}

export interface BeamWebRtcHost {
  state: BeamWebRtcState;
  getRole: () => 'receiver' | 'sender' | null;
  getConnectedRoom: () => string | null;
  getSessionId: () => string | null;
  getPeerSessionId: () => string | null;
  getDeviceId: () => string;
  isPeerConnected: () => boolean;
  createPeerConnection: () => RTCPeerConnection | null;
  closeRtc: () => void;
  scheduleRtcRetry: () => void;
  setupDataChannel: (channel: RTCDataChannel) => void;
  broadcast: (message: BeamMessage) => Promise<void>;
  setPeerTransport: (transport: BeamTransport | null) => void;
  updateTransfer: (patch: Partial<BeamTransferState>) => void;
  handleIncoming: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  deliverDocument: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  handleFileCompletion: (transferId: string, ok: boolean, message?: string) => void;
  resolveFileCompletion: (error: Error | null) => void;
  registerCompletion: (transferId: string, timeoutMs: number, timeoutMessage: string) => Promise<void>;
  getFileCompletionId: () => string | null;
  handleDataChannelPayload: (data: unknown) => Promise<void>;
  finishIncomingFile: (transferId: string) => Promise<void>;
  beginIncomingFile: (meta: {
    sessionId?: string;
    size?: number;
    transferId?: string;
    title?: string;
    name?: string;
    sha256?: string;
    pageNumber?: number;
    totalPages?: number;
    theme?: ThemeMode;
  }) => void;
  sendDataChannelControl: (message: Record<string, unknown>) => void;
}

export function createBeamPeerConnection(host: BeamWebRtcHost): RTCPeerConnection | null {
  if (!host.state.isRtcSupported) return null;
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peer.onicecandidate = (event) => {
    if (peer !== host.state.rtcPeer || !event.candidate) return;
    const roomCode = host.getConnectedRoom();
    if (!roomCode) return;
    const sessionId = host.getRole() === 'sender' ? host.getSessionId() : host.getPeerSessionId();
    if (!sessionId) return;
    void host.broadcast({
      type: 'BEAM_RTC_ICE',
      roomCode,
      sessionId,
      candidate: event.candidate.toJSON(),
      timestamp: Date.now(),
    });
  };
  peer.onconnectionstatechange = () => {
    if (peer !== host.state.rtcPeer) return;
    if (peer.connectionState === 'connected') {
      host.setPeerTransport(host.state.rtcDataChannel?.readyState === 'open' ? 'p2p' : 'relay');
    } else if (peer.connectionState === 'failed') {
      host.setPeerTransport(host.isPeerConnected() ? 'relay' : null);
      host.scheduleRtcRetry();
    }
  };
  peer.oniceconnectionstatechange = () => {
    if (peer !== host.state.rtcPeer) return;
    if (peer.iceConnectionState === 'failed') {
      host.scheduleRtcRetry();
    }
  };
  return peer;
}

export async function initiateBeamRtc(host: BeamWebRtcHost): Promise<void> {
  const room = host.getConnectedRoom();
  const sessionId = host.getSessionId();
  if (!host.state.isRtcSupported || host.getRole() !== 'sender' || !room) return;
  if (!sessionId || !host.getPeerSessionId()) return;

  host.state.rtcAttempt += 1;
  host.closeRtc();

  try {
    const peer = host.createPeerConnection();
    if (!peer) return;
    host.state.rtcPeer = peer;
    host.state.remoteDescriptionSet = false;
    host.state.queuedIce = [];

    const channel = peer.createDataChannel('otium_p2p_channel', { ordered: true });
    host.setupDataChannel(channel);

    const offer = await peer.createOffer();
    if (peer !== host.state.rtcPeer) return;
    await peer.setLocalDescription(offer);
    if (peer !== host.state.rtcPeer || peer.signalingState === 'closed') return;
    const description = peer.localDescription || offer;

    await host.broadcast({
      type: 'BEAM_RTC_OFFER',
      roomCode: room,
      sessionId,
      sdp: description,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.debug('WebRTC initiate note:', error);
    host.scheduleRtcRetry();
  }
}

export async function flushBeamQueuedIce(state: BeamWebRtcState): Promise<void> {
  if (!state.rtcPeer || !state.remoteDescriptionSet) return;
  const queued = state.queuedIce;
  state.queuedIce = [];
  for (const candidate of queued) {
    try {
      await state.rtcPeer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.debug('WebRTC queued ice note:', error);
    }
  }
}

export async function handleBeamRtcOffer(host: BeamWebRtcHost, message: BeamMessage): Promise<void> {
  if (!host.state.isRtcSupported || !message.sdp || host.getRole() !== 'receiver') return;
  if (!message.sessionId || message.sessionId !== host.getPeerSessionId()) return;

  const sdp = message.sdp.sdp || '';
  if (host.state.rtcPeer && host.state.lastOfferSdp === sdp) return;
  host.state.lastOfferSdp = sdp;

  const earlyIce = host.state.queuedIce;
  host.closeRtc();
  host.state.queuedIce = earlyIce;
  host.state.lastOfferSdp = sdp;

  try {
    const peer = host.createPeerConnection();
    if (!peer) return;
    host.state.rtcPeer = peer;
    host.state.remoteDescriptionSet = false;

    peer.ondatachannel = (event) => {
      if (peer !== host.state.rtcPeer) return;
      host.setupDataChannel(event.channel);
    };

    await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
    if (peer !== host.state.rtcPeer) return;
    host.state.remoteDescriptionSet = true;
    await flushBeamQueuedIce(host.state);

    const answer = await peer.createAnswer();
    if (peer !== host.state.rtcPeer) return;
    await peer.setLocalDescription(answer);
    if (peer !== host.state.rtcPeer || peer.signalingState === 'closed') return;
    const description = peer.localDescription || answer;

    await host.broadcast({
      type: 'BEAM_RTC_ANSWER',
      roomCode: host.getConnectedRoom()!,
      sessionId: message.sessionId,
      sdp: description,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.debug('WebRTC offer handle note:', error);
  }
}

export async function handleBeamRtcAnswer(state: BeamWebRtcState, message: BeamMessage): Promise<void> {
  if (!state.isRtcSupported || !state.rtcPeer || !message.sdp) return;
  try {
    if (state.rtcPeer.signalingState === 'have-local-offer') {
      await state.rtcPeer.setRemoteDescription(new RTCSessionDescription(message.sdp));
      state.remoteDescriptionSet = true;
      await flushBeamQueuedIce(state);
    }
  } catch (error) {
    console.debug('WebRTC answer handle note:', error);
  }
}

export async function handleBeamRtcIce(state: BeamWebRtcState, message: BeamMessage): Promise<void> {
  if (!state.isRtcSupported || !message.candidate) return;
  if (!state.rtcPeer || !state.remoteDescriptionSet) {
    if (state.queuedIce.length < 200) {
      state.queuedIce.push(message.candidate);
    }
    return;
  }
  try {
    await state.rtcPeer.addIceCandidate(new RTCIceCandidate(message.candidate));
  } catch (error) {
    console.debug('WebRTC ice candidate note:', error);
  }
}

export function bindBeamDataChannel(host: BeamWebRtcHost, channel: RTCDataChannel): void {
  host.state.rtcDataChannel = channel;
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = 256 * 1024;

  channel.onopen = () => {
    if (host.state.rtcDataChannel !== channel) return;
    host.state.rtcAttempt = 0;
    host.setPeerTransport('p2p');
  };

  channel.onclose = () => {
    if (host.state.rtcDataChannel !== channel) return;
    host.state.rtcDataChannel = null;
    host.setPeerTransport(host.isPeerConnected() ? 'relay' : null);
  };

  channel.onerror = () => {
    console.debug('Otium Beam P2P channel error; relay remains available.');
  };

  channel.onmessage = (event) => {
    if (host.state.rtcDataChannel !== channel) return;
    void host.handleDataChannelPayload(event.data);
  };
}

export async function processDataChannelPayload(host: BeamWebRtcHost, data: unknown): Promise<void> {
  interface DataChannelControlMessage {
    kind?: string;
    transferId?: string;
    ok?: boolean;
    message?: string;
    type?: BeamMessage['type'];
    roomCode?: string;
    sessionId?: string;
    size?: number;
    title?: string;
    name?: string;
    sha256?: string;
    pageNumber?: number;
    totalPages?: number;
    theme?: ThemeMode;
  }

  if (typeof data === 'string') {
    let parsed: DataChannelControlMessage;
    try {
      parsed = JSON.parse(data) as DataChannelControlMessage;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    if (parsed.kind === 'file-begin') {
      host.beginIncomingFile(parsed);
      return;
    }
    if (parsed.kind === 'file-end') {
      await host.finishIncomingFile(String(parsed.transferId || ''));
      return;
    }
    if (parsed.kind === 'file-cancel') {
      host.state.incomingFile = null;
      host.updateTransfer({ active: false, phase: 'error', error: 'The sender cancelled the transfer.' });
      return;
    }
    if (parsed.kind === 'file-complete') {
      host.handleFileCompletion(String(parsed.transferId || ''), parsed.ok === true, parsed.message);
      return;
    }
    if (parsed.kind === 'file-error') {
      host.handleFileCompletion(String(parsed.transferId || ''), false, parsed.message);
      return;
    }

    if (parsed.type && parsed.roomCode) {
      await host.handleIncoming(parsed as unknown as BeamMessage, 'p2p');
    }
    return;
  }

  let buffer: ArrayBuffer | null = null;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    buffer = await data.arrayBuffer();
  }
  if (!buffer || !host.state.incomingFile) return;

  const file = host.state.incomingFile;
  file.parts.push(buffer);
  file.received += buffer.byteLength;

  if (file.size > 0) {
    const now = Date.now();
    if (now - file.lastProgressAt > 120 || file.received >= file.size) {
      file.lastProgressAt = now;
      host.updateTransfer({
        active: true,
        direction: 'receive',
        mode: 'p2p',
        phase: 'transferring',
        progress: Math.min(96, Math.round((file.received / file.size) * 96)),
        bytesTransferred: file.received,
        totalBytes: file.size,
      });
    }
  }
}

export function beginBeamIncomingFile(
  host: BeamWebRtcHost,
  meta: {
    sessionId?: string;
    size?: number;
    transferId?: string;
    title?: string;
    name?: string;
    sha256?: string;
    pageNumber?: number;
    totalPages?: number;
    theme?: ThemeMode;
  }
): void {
  if (!meta || meta.sessionId !== host.getPeerSessionId()) return;
  const size = Number(meta.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    host.updateTransfer({
      active: false,
      phase: 'error',
      error: 'The incoming file size is invalid.',
    });
    return;
  }

  host.state.incomingFile = {
    transferId: String(meta.transferId || randomId('r')),
    title: String(meta.title || 'Beamed Document'),
    name: String(meta.name || 'document.pdf'),
    size,
    sha256: typeof meta.sha256 === 'string' ? meta.sha256 : undefined,
    pageNumber: Number(meta.pageNumber) || 1,
    totalPages: Number(meta.totalPages) || 1,
    theme: meta.theme || 'midnight',
    parts: [],
    received: 0,
    lastProgressAt: 0,
  };

  host.updateTransfer({
    active: true,
    direction: 'receive',
    mode: 'p2p',
    phase: 'transferring',
    progress: 0,
    bytesTransferred: 0,
    totalBytes: size,
    error: null,
  });
}

export async function finishBeamIncomingFile(host: BeamWebRtcHost, transferId: string): Promise<void> {
  const file = host.state.incomingFile;
  if (!file || file.transferId !== transferId) return;
  host.state.incomingFile = null;
  const session = host.getPeerSessionId();

  try {
    host.updateTransfer({
      active: true,
      phase: 'finalizing',
      progress: 98,
      bytesTransferred: file.received,
      totalBytes: file.size,
    });

    if (file.received !== file.size) {
      throw new Error(`P2P size mismatch (expected ${file.size} bytes, got ${file.received}).`);
    }

    const merged = mergeBuffers(file.parts);
    if (!isPdfHeader(merged)) {
      throw new Error('The received file is not a valid PDF.');
    }
    if (file.sha256) {
      const actual = await computeSha256(merged);
      if (actual && actual !== file.sha256) {
        throw new Error('P2P checksum mismatch.');
      }
    }

    const payloadMessage: BeamMessage = {
      type: 'BEAM_PAYLOAD',
      roomCode: host.getConnectedRoom() || '',
      msgId: randomId('m'),
      sessionId: host.getPeerSessionId() || undefined,
      origin: host.getDeviceId(),
      payload: {
        title: file.title,
        pageNumber: file.pageNumber,
        totalPages: file.totalPages,
        theme: file.theme,
        pdfData: merged,
        totalSize: merged.byteLength,
        sha256: file.sha256,
        transferId: file.transferId,
      },
      timestamp: Date.now(),
    };

    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;
    await host.deliverDocument(payloadMessage, 'p2p');
    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;

    host.updateTransfer({
      active: false,
      phase: 'done',
      progress: 100,
      bytesTransferred: file.size,
      totalBytes: file.size,
    });

    host.sendDataChannelControl({
      kind: 'file-complete',
      transferId: file.transferId,
      ok: true,
    });
  } catch (error) {
    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;
    const message = error instanceof Error ? error.message : 'P2P receive failed.';
    host.updateTransfer({ active: false, phase: 'error', error: message });
    host.sendDataChannelControl({
      kind: 'file-error',
      transferId: file.transferId,
      message,
    });
  }
}

export async function sendFileOverBeamChannel(
  host: BeamWebRtcHost,
  options: SendDocumentOptions
): Promise<void> {
  const session = host.getSessionId();
  const channel = host.state.rtcDataChannel;
  if (!channel || channel.readyState !== 'open') {
    throw new Error('The direct channel is not open yet.');
  }

  const transferId = randomId('t');
  const sha256 = await computeSha256(options.buffer);
  const completion = host.registerCompletion(
    transferId,
    90000,
    'The receiver did not confirm the direct transfer.'
  );
  void completion.catch(() => {});

  try {
    channel.send(
      JSON.stringify({
        kind: 'file-begin',
        transferId,
        sessionId: host.getSessionId(),
        name: options.title ? `${options.title}.pdf` : 'document.pdf',
        title: options.title,
        size: options.buffer.byteLength,
        sha256,
        pageNumber: options.pageNumber,
        totalPages: options.totalPages,
        theme: options.theme,
      })
    );

    host.updateTransfer({
      active: true,
      direction: 'send',
      mode: 'p2p',
      phase: 'transferring',
      progress: 4,
      bytesTransferred: 0,
      totalBytes: options.buffer.byteLength,
      error: null,
    });

    let offset = 0;
    while (offset < options.buffer.byteLength) {
      if (channel.readyState !== 'open') {
        throw new Error('The direct channel closed during transfer.');
      }
      while (channel.readyState === 'open' && channel.bufferedAmount > P2P_HIGH_WATER_MARK) {
        await sleep(40);
      }
      const end = Math.min(offset + P2P_CHUNK_SIZE, options.buffer.byteLength);
      channel.send(options.buffer.slice(offset, end));
      offset = end;
      host.updateTransfer({
        phase: 'transferring',
        progress: Math.min(94, 4 + Math.round((offset / options.buffer.byteLength) * 90)),
        bytesTransferred: offset,
      });
    }

    channel.send(JSON.stringify({ kind: 'file-end', transferId }));
    host.updateTransfer({ phase: 'finalizing', progress: 96 });
    await completion;
    if (host.getSessionId() !== session || host.state.rtcDataChannel !== channel) {
      throw new Error('The transfer was cancelled.');
    }

    host.updateTransfer({
      active: false,
      phase: 'done',
      progress: 100,
      bytesTransferred: options.buffer.byteLength,
      totalBytes: options.buffer.byteLength,
    });
  } catch (error) {
    if (host.getFileCompletionId() === transferId) {
      host.resolveFileCompletion(null);
    }
    host.sendDataChannelControl({ kind: 'file-cancel', transferId });
    throw error;
  }
}

export function closeBeamRtcPeer(state: BeamWebRtcState): void {
  if (state.rtcDataChannel) {
    try {
      state.rtcDataChannel.onopen = null;
      state.rtcDataChannel.onclose = null;
      state.rtcDataChannel.onerror = null;
      state.rtcDataChannel.onmessage = null;
      state.rtcDataChannel.close();
    } catch {}
    state.rtcDataChannel = null;
  }
  if (state.rtcPeer) {
    try {
      state.rtcPeer.onicecandidate = null;
      state.rtcPeer.onconnectionstatechange = null;
      state.rtcPeer.oniceconnectionstatechange = null;
      state.rtcPeer.ondatachannel = null;
      state.rtcPeer.close();
    } catch {}
    state.rtcPeer = null;
  }
  state.remoteDescriptionSet = false;
  state.queuedIce = [];
  state.lastOfferSdp = null;
  state.incomingFile = null;
}
