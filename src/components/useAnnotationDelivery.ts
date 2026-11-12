import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import type { BeamMessage } from '../board/types';
import { beamService } from '../board/beam/beamService';

type DeliveryState = 'local' | 'sending' | 'received' | 'waiting';

/** Delivery is confirmed by the other reader, never inferred from a successful send. */
export function useAnnotationDelivery(reader: ReaderController) {
  const defaultDelivery: DeliveryState = reader.beamRoom ? 'waiting' : 'local';
  const contextKey = `${reader.docId ?? ''}:${reader.beamRoom ?? ''}:${reader.beamPeerConnected ? 1 : 0}`;
  const [deliveryState, setDeliveryState] = useState<{ key: string; value: DeliveryState }>(() => ({
    key: contextKey,
    value: defaultDelivery
  }));
  const delivery = deliveryState.key === contextKey ? deliveryState.value : defaultDelivery;
  const setDelivery = useCallback((value: DeliveryState) => {
    setDeliveryState({ key: contextKey, value });
  }, [contextKey]);
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContextRef = useRef(contextKey);
  useEffect(() => {
    if (prevContextRef.current !== contextKey) {
      prevContextRef.current = contextKey;
      pending.current.clear();
      if (timer.current) clearTimeout(timer.current);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [contextKey]);
  useEffect(() => beamService.subscribe(message => {
    const receipt = message.annotationReceipt;
    if (message.type !== 'BEAM_ANNOTATION_ACK' || receipt?.documentId !== reader.docId || !pending.current.delete(receipt.id)) return;
    if (!pending.current.size) { if (timer.current) clearTimeout(timer.current); setDelivery('received'); }
  }), [reader.docId, setDelivery]);
  const send = useCallback((message: BeamMessage) => {
    if (!reader.beamPeerConnected) { setDelivery('waiting'); return; }
    const receiptId = crypto.randomUUID();
    pending.current.add(receiptId); setDelivery('sending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (pending.current.size) setDelivery('waiting'); }, 8000);
    void beamService.broadcast({ ...message, receiptId }).catch(() => setDelivery('waiting'));
  }, [reader.beamPeerConnected, setDelivery]);
  const acknowledge = useCallback((message: BeamMessage) => {
    if (!message.receiptId || message.receiptId.length > 128 || !reader.docId || !reader.beamPeerConnected) return;
    void beamService.broadcast({ type: 'BEAM_ANNOTATION_ACK', roomCode: message.roomCode,
      annotationReceipt: { documentId: reader.docId, id: message.receiptId }, timestamp: Date.now() });
  }, [reader.docId, reader.beamPeerConnected]);
  return { delivery, send, acknowledge };
}
