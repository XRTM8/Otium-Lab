import type { BeamMessage, BeamTransferState } from '../types';
import { boundedResponseBytes, trustedRelayUrl } from './beamSecurity';
import {
  CLOUD_RELAY_BASE,
  RELAY_CHUNK_SIZE,
  RELAY_MAX_BYTES,
  MAX_FILE_BYTES,
  type SendDocumentOptions,
  computeSha256,
  fetchWithTimeout,
  getDeviceLabel,
  isBrowserNetworkAvailable,
  isPdfHeader,
  isRetryableStatus,
  mergeBuffers,
  mapWithConcurrency,
  randomId,
  retryDelayMs,
  safeTopicPart,
  sleep,
  topicForRoom,
} from './beamUtils';

export interface RelayAttachmentPayload {
  event?: string;
  id?: string;
  type?: string;
  roomCode?: string;
  message?: string;
  time?: number;
  attachment?: {
    url?: string;
    name?: string;
  };
}

export async function fetchRelayWithRetry(url: string, attempts = 3): Promise<Response> {
  const safeUrl = trustedRelayUrl(url);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        safeUrl,
        { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' },
        45000
      );
      if (response.ok) return response;
      if (isRetryableStatus(response.status) && attempt < attempts - 1) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      throw new Error(`Relay returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(retryDelayMs(null, attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to download the relay attachment.');
}

export async function fetchRelayAttachmentText(url: string): Promise<string> {
  const response = await fetchRelayWithRetry(url);
  return new TextDecoder().decode(await boundedResponseBytes(response, 2 * 1024 * 1024));
}

export async function fetchRelayAttachmentBuffer(url: string, maxBytes = MAX_FILE_BYTES): Promise<ArrayBuffer> {
  const response = await fetchRelayWithRetry(url);
  return boundedResponseBytes(response, maxBytes);
}

export async function extractMessagesFromRelayEvent(
  parsed: RelayAttachmentPayload,
  context: {
    role: 'receiver' | 'sender' | null;
    peerSessionId: string | null;
    connectedRoom: string | null;
    fetchText: (url: string) => Promise<string>;
  }
): Promise<BeamMessage[]> {
  if (parsed.type && parsed.roomCode && !parsed.message) {
    return [parsed as unknown as BeamMessage];
  }

  if (typeof parsed.message === 'string' && parsed.message.length > 0) {
    try {
      const inner = JSON.parse(parsed.message) as Partial<BeamMessage> | null;
      if (inner && inner.type && inner.roomCode) {
        return [inner as BeamMessage];
      }
    } catch {
      // ntfy stores bodies larger than 4 KB as an attachment.
    }
  }

  const attachment = parsed.attachment;
  if (attachment?.url) {
    const name = String(attachment.name || '').toLowerCase();
    const isJsonLike =
      name.endsWith('.json') ||
      name.endsWith('.txt') ||
      name.endsWith('.bin') ||
      name === 'attachment' ||
      name === '';
    if (isJsonLike) {
      try {
        const text = await context.fetchText(attachment.url);
        const inner = JSON.parse(text) as Partial<BeamMessage> | null;
        if (inner && inner.type && inner.roomCode) {
          return [inner as BeamMessage];
        }
      } catch (error) {
        console.warn('Failed to read beam relay attachment:', error);
      }
    } else if (name.includes('.pdf')) {
      // Backwards compatibility with v1 senders before pairing sessions existed.
      if (context.role !== 'receiver' || context.peerSessionId) return [];
      let title = 'document';
      try {
        title = decodeURIComponent(attachment.name || '').replace(/\.pdf$/i, '');
      } catch {
        title = String(attachment.name || '').replace(/\.pdf$/i, '');
      }
      return [
        {
          type: 'BEAM_PAYLOAD',
          roomCode: context.connectedRoom || 'BEAM',
          payload: {
            title,
            pageNumber: 1,
            totalPages: 1,
            theme: 'midnight',
            pdfUrl: attachment.url,
          },
          timestamp: typeof parsed.time === 'number' ? parsed.time * 1000 : Date.now(),
        },
      ];
    }
  }

  return [];
}

export async function downloadChunksViaRelay({
  chunks,
  expectedSize,
  expectedSha256,
  fetchChunk,
  onTransferPatch,
}: {
  chunks: string[];
  expectedSize?: number;
  expectedSha256?: string;
  fetchChunk: (url: string, maxBytes: number) => Promise<ArrayBuffer>;
  onTransferPatch: (patch: Partial<BeamTransferState>) => void;
}): Promise<ArrayBuffer> {
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > Math.ceil(RELAY_MAX_BYTES / RELAY_CHUNK_SIZE) + 1) {
    throw new Error('The relay payload contains no chunks.');
  }
  if (expectedSize !== undefined && (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > RELAY_MAX_BYTES)) {
    throw new Error('Invalid relay transfer size.');
  }
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('Invalid relay checksum.');
  }
  chunks.forEach(trustedRelayUrl);

  onTransferPatch({
    active: true,
    direction: 'receive',
    mode: 'relay',
    phase: 'transferring',
    progress: 0,
    bytesTransferred: 0,
    totalBytes: expectedSize || 0,
    error: null,
  });

  try {
    const parts: ArrayBuffer[] = new Array(chunks.length);
    let downloaded = 0;

    const downloadOne = async (url: string, index: number): Promise<void> => {
      const buffer = await fetchChunk(url, RELAY_CHUNK_SIZE + 1024);
      parts[index] = buffer;
      downloaded += buffer.byteLength;
      if (downloaded > RELAY_MAX_BYTES || (expectedSize && downloaded > expectedSize)) {
        throw new Error('Relay payload exceeds the announced size.');
      }
      const total = expectedSize || downloaded;
      onTransferPatch({
        phase: 'transferring',
        progress: Math.min(96, Math.round((downloaded / Math.max(1, total)) * 100)),
        bytesTransferred: downloaded,
        totalBytes: total,
      });
    };

    await mapWithConcurrency(chunks, 3, downloadOne);

    const merged = mergeBuffers(parts);
    if (expectedSize && merged.byteLength !== expectedSize) {
      throw new Error(`Relay size mismatch (expected ${expectedSize} bytes, got ${merged.byteLength}).`);
    }
    if (!isPdfHeader(merged)) {
      throw new Error('The relay payload is not a valid PDF.');
    }
    if (expectedSha256) {
      const actual = await computeSha256(merged);
      if (!actual || actual.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error('Relay checksum mismatch. Please retry the transfer.');
      }
    }

    onTransferPatch({
      active: true,
      phase: 'finalizing',
      progress: 98,
      bytesTransferred: merged.byteLength,
      totalBytes: merged.byteLength,
    });
    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relay download failed.';
    onTransferPatch({ active: false, phase: 'error', error: message });
    throw error;
  }
}

export async function putRelayAttachment(
  topic: string,
  data: ArrayBuffer,
  filename: string
): Promise<string> {
  const encodedName = encodeURIComponent(filename);
  const url = `${CLOUD_RELAY_BASE}/${topic}?filename=${encodedName}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'PUT',
          headers: {
            Filename: encodedName,
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        },
        60000
      );

      if (response.ok) {
        const parsed = (await response.json()) as { attachment?: { url?: unknown } };
        const attachmentUrl = parsed?.attachment?.url;
        if (typeof attachmentUrl === 'string' && attachmentUrl.length > 0) {
          return trustedRelayUrl(attachmentUrl);
        }
        throw new Error('The relay did not return an attachment URL.');
      }

      if (isRetryableStatus(response.status) && attempt < 3) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      if (response.status === 413) {
        throw new Error('The cloud relay rejected a file chunk. The PDF may be too large for relay mode.');
      }
      if (response.status === 429) {
        throw new Error('The public relay is rate-limiting uploads. Wait a few seconds and retry, or keep both devices on the same Wi-Fi.');
      }
      throw new Error(`The cloud relay returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(retryDelayMs(null, attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to upload a file chunk to the relay.');
}

export async function publishRelayMessage({
  connectedRoom,
  deviceId,
  message,
  onPublishFailed,
}: {
  connectedRoom: string | null;
  deviceId: string;
  message: BeamMessage;
  onPublishFailed: () => void;
}): Promise<boolean> {
  if (!connectedRoom || !isBrowserNetworkAvailable()) return false;
  const topic = topicForRoom(message.roomCode);
  const body: BeamMessage = {
    ...message,
    msgId: message.msgId || randomId('m'),
    origin: message.origin || deviceId,
    timestamp: message.timestamp || Date.now(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${CLOUD_RELAY_BASE}/${topic}`,
        {
          method: 'POST',
          keepalive: body.type === 'BEAM_DISCONNECT',
          headers: {
            'Content-Type': 'application/json',
            'X-Title': 'Otium Beam',
          },
          body: JSON.stringify(body),
        },
        15000
      );
      if (response.ok) return true;
      if (isRetryableStatus(response.status) && attempt === 0) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      return false;
    } catch (error) {
      if (attempt === 0) {
        await sleep(retryDelayMs(null, attempt));
      } else {
        console.debug('Cloud signaling transport note:', error);
      }
    }
  }
  onPublishFailed();
  return false;
}

export async function uploadAndBroadcastViaRelay({
  connectedRoom,
  sessionId,
  options,
  assertActive,
  putChunk,
  onTransferPatch,
  registerCompletion,
  broadcastPayload,
}: {
  connectedRoom: string;
  sessionId: string | null;
  options: SendDocumentOptions;
  assertActive: () => void;
  putChunk: (topic: string, chunk: ArrayBuffer, filename: string) => Promise<string>;
  onTransferPatch: (patch: Partial<BeamTransferState>) => void;
  registerCompletion: (transferId: string) => Promise<void>;
  broadcastPayload: (msg: BeamMessage) => Promise<void>;
}): Promise<void> {
  const totalBytes = options.buffer.byteLength;
  const sha256 = await computeSha256(options.buffer);
  assertActive();
  const transferId = randomId('t');
  const chunkCount = Math.ceil(totalBytes / RELAY_CHUNK_SIZE);
  const baseTopic = topicForRoom(connectedRoom);
  const safeName = encodeURIComponent(
    (options.title || 'document').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  );
  const chunks: string[] = [];

  onTransferPatch({
    active: true,
    direction: 'send',
    mode: 'relay',
    phase: 'transferring',
    progress: 2,
    bytesTransferred: 0,
    totalBytes,
    error: null,
  });

  for (let index = 0; index < chunkCount; index++) {
    const start = index * RELAY_CHUNK_SIZE;
    const end = Math.min(start + RELAY_CHUNK_SIZE, totalBytes);
    const chunk = options.buffer.slice(start, end);
    const topic = `${baseTopic}_${safeTopicPart(transferId)}_c${index}`;
    const filename = `${safeName}.part${index}`;
    const url = await putChunk(topic, chunk, filename);
    assertActive();
    chunks.push(url);
    onTransferPatch({
      phase: 'transferring',
      progress: Math.min(88, 2 + Math.round(((index + 1) / chunkCount) * 86)),
      bytesTransferred: end,
    });
  }

  onTransferPatch({ phase: 'finalizing', progress: 92 });
  const completion = registerCompletion(transferId);
  void completion.catch(() => {});
  await broadcastPayload({
    type: 'BEAM_PAYLOAD',
    roomCode: connectedRoom,
    sessionId: sessionId || undefined,
    senderName: getDeviceLabel(),
    payload: {
      title: options.title,
      pageNumber: options.pageNumber,
      totalPages: options.totalPages,
      theme: options.theme,
      chunks,
      totalSize: totalBytes,
      sha256: sha256 || undefined,
      transferId,
    },
    timestamp: Date.now(),
  });

  await completion;
  assertActive();

  onTransferPatch({
    active: false,
    phase: 'done',
    progress: 100,
    bytesTransferred: totalBytes,
    totalBytes,
  });
}
