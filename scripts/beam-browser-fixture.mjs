import { PDFDocument } from 'pdf-lib';
import { BeamService } from '../src/board/beam/beamService.ts';
import { BeamAnnotationQueue } from '../src/board/beam/beamAnnotationQueue.ts';
import { computeSha256, P2P_CHUNK_SIZE } from '../src/board/beam/beamUtils.ts';
import { mergeInk } from '../src/core/annotations/ink.ts';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, description) {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await wait(40);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function createPdf() {
  const document = await PDFDocument.create();
  document.addPage().drawText('Beam over WebRTC');
  const bytes = Uint8Array.from({ length: 3 * P2P_CHUNK_SIZE }, (_, index) => index % 251);
  document.context.register(document.context.stream(bytes));
  return Uint8Array.from(await document.save()).buffer;
}

export async function runBeamRecovery() {
  const NativePeer = globalThis.RTCPeerConnection;
  const nativeFetch = globalThis.fetch;
  const NativeEventSource = globalThis.EventSource;
  const channels = [];
  const begins = [];
  const sentBytes = [];
  const room = 'OTM-4917';
  let initialOffset = 0;
  let opened = 0;
  let openedHash;
  let pages = 0;

  // Keep signaling in this browser, while the peers negotiate native ICE/SCTP.
  globalThis.EventSource = undefined;
  globalThis.fetch = async () => new Response('');
  globalThis.RTCPeerConnection = class extends NativePeer {
    constructor(config) {
      super({ ...config, iceServers: [] });
    }
    createDataChannel(label, options) {
      const channel = super.createDataChannel(label, options);
      const send = channel.send.bind(channel);
      const index = channels.push(channel) - 1;
      sentBytes[index] = 0;
      channel.send = (data) => {
        send(data);
        if (typeof data === 'string') {
          const frame = JSON.parse(data);
          if (frame.kind === 'file-begin') begins.push(frame);
          return;
        }
        sentBytes[index] += data.byteLength;
        if (index === 0 && sentBytes[0] === P2P_CHUNK_SIZE) {
          // Give the receiver time to process the first real chunk before cutting the channel.
          Object.defineProperty(channel, 'bufferedAmount', { get: () => 2 * 1024 * 1024 });
        }
      };
      return channel;
    }
  };

  const sender = new BeamService();
  const receiver = new BeamService();
  try {
    receiver.onTransferProgress(state => {
      if (initialOffset || state.mode !== 'p2p' || state.bytesTransferred !== P2P_CHUNK_SIZE) return;
      initialOffset = state.bytesTransferred;
      channels[0].close();
    });
    receiver.subscribe(async (message, via) => {
      if (message.type !== 'BEAM_PAYLOAD' || via !== 'p2p' || !message.payload?.pdfData) return;
      opened++;
      openedHash = await computeSha256(message.payload.pdfData);
      pages = (await PDFDocument.load(message.payload.pdfData)).getPageCount();
    });
    receiver.startReceiver(room);
    sender.startSender(room);
    await until(() => sender.getPeerState().transport === 'p2p', 'initial WebRTC channel');
    const buffer = await createPdf();
    const { mode } = await sender.sendDocument({ roomCode: room, buffer, title: 'Beam browser test', pageNumber: 1, totalPages: 1, theme: 'paper' });
    const pdf = {
      mode, initialOffset, resumedOffset: begins[1]?.offset, opened, pages,
      transferIdPreserved: begins.length === 2 && begins[0].transferId === begins[1].transferId,
      bytesPreserved: typeof openedHash === 'string' && openedHash === await computeSha256(buffer),
      bytesOnReplacement: sentBytes[1],
      expectedReplacementBytes: buffer.byteLength - initialOffset,
    };
    if (mode !== 'p2p' || initialOffset !== P2P_CHUNK_SIZE || pdf.resumedOffset !== initialOffset ||
        !pdf.transferIdPreserved || !pdf.bytesPreserved || opened !== 1 || pages !== 1 ||
        pdf.bytesOnReplacement !== pdf.expectedReplacementBytes) {
      throw new Error(`Unexpected WebRTC PDF recovery: ${JSON.stringify(pdf)}`);
    }
    return { pdf, ink: await verifyInkRecovery(sender, receiver, channels, room) };
  } finally {
    sender.disconnect();
    receiver.disconnect();
    globalThis.RTCPeerConnection = NativePeer;
    globalThis.fetch = nativeFetch;
    globalThis.EventSource = NativeEventSource;
  }
}

async function verifyInkRecovery(sender, receiver, channels, room) {
  const documentId = 'beam-browser-pdf';
  const initial = { id: 'initial', type: 'pen', color: '#ffffff', page: 1, width: 0.004, points: [{ x: 0.1, y: 0.1 }] };
  const added = { ...initial, id: 'added' };
  let marks = [initial];
  let applied = 0;
  let receipts = 0;
  let duplicateReceived = false;
  let delivery = 'waiting';
  const receiptIds = [];
  const queue = new BeamAnnotationQueue({
    documentId, room,
    broadcast: message => sender.broadcast(message),
    onDelivery: value => { delivery = value; },
  });
  const inbox = new BeamAnnotationQueue({
    documentId, room, onDelivery: () => {},
    broadcast: async message => {
      if (++receipts > 1) await receiver.broadcast(message);
    },
  });
  const stopReceipts = sender.subscribe((message, via) => {
    if (via === 'p2p') queue.receiveReceipt(message);
  });
  const stopUpdates = receiver.subscribe((message, via) => {
    if (via !== 'p2p' || message.type !== 'BEAM_INK_UPDATE' || message.ink?.documentId !== documentId) return;
    if (receiptIds.includes(message.receiptId)) duplicateReceived = true;
    receiptIds.push(message.receiptId);
    inbox.receive(message.type, message, message.ink, (upsert, deleted) => {
      marks = mergeInk(marks, upsert, deleted);
      applied++;
    });
    if (receipts === 1) {
      queue.connect(false);
      channels[channels.length - 1].close();
    }
  });
  function edit(patch) {
    queue.send({ type: 'BEAM_INK_UPDATE', roomCode: room, ink: { documentId, ...patch }, timestamp: Date.now() });
  }
  try {
    queue.connect(true);
    edit({ upsert: [added] });
    await until(() => receipts === 1 && sender.getPeerState().transport !== 'p2p', 'dropped WebRTC ink receipt');
    edit({ deleted: [initial.id] });
    await until(() => sender.getPeerState().transport === 'p2p', 'replacement WebRTC channel for ink');
    queue.connect(true);
    await until(() => delivery === 'received', 'ink retry receipts');
    const ink = { duplicateReceived, applied, receipts, markIds: marks.map(mark => mark.id) };
    if (!duplicateReceived || applied !== 2 || receipts !== 3 || ink.markIds.join() !== 'added') {
      throw new Error(`Unexpected WebRTC ink recovery: ${JSON.stringify(ink)}`);
    }
    return ink;
  } finally {
    queue.connect(false, false);
    stopReceipts();
    stopUpdates();
  }
}
