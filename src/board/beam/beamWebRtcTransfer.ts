import type { BeamMessage } from '../types';
import type { ThemeMode } from '../../core/types';
import { ignoreBenignRejection } from '../../core/utils/bestEffort';
import {
  MAX_FILE_BYTES,
  P2P_CHUNK_SIZE,
  P2P_HIGH_WATER_MARK,
  computeSha256,
  isBeamMessage,
  isPdfHeader,
  mergeBuffers,
  randomId,
  sleep,
  type SendDocumentOptions,
} from './beamUtils';
import type { BeamWebRtcHost } from './beamWebRtcTransport';

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

    if (isBeamMessage(parsed)) {
      await host.handleIncoming(parsed, 'p2p');
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
  ignoreBenignRejection(completion, 'rtc-completion-preattach');

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
