import { memo, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { InkPoint, InkStroke } from './drawing';
const StrokeShape = memo(function StrokeShape({ stroke, width, height }: { stroke: InkStroke; width: number; height: number }) {
  return stroke.points.length === 1
    ? <circle cx={stroke.points[0].x * width} cy={stroke.points[0].y * height} r={stroke.width * width / 2} fill={stroke.color} opacity={stroke.opacity} />
    : <polyline points={stroke.points.map(p => `${p.x * width},${p.y * height}`).join(' ')} fill="none" stroke={stroke.color} opacity={stroke.opacity} strokeWidth={stroke.width * width} strokeLinecap="round" strokeLinejoin="round" />;
});

export function Ink({ enabled, color, width, height, strokes: controlled, onChange, size = 3, highlighter = false }: {
  enabled: boolean; color: string; width: number; height: number;
  strokes?: InkStroke[]; onChange?: (value: InkStroke[]) => void; size?: number; highlighter?: boolean;
}) {
  const [internal, setInternal] = useState<InkStroke[]>([]);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const strokes = controlled ?? internal;
  const pointer = useRef<number | null>(null), live = useRef<InkStroke | null>(null);
  useEffect(() => {
    if (!enabled) {
      pointer.current = null;
      live.current = null;
    }
  }, [enabled]);
  const point = (event: Pick<PointerEvent<SVGSVGElement>, 'clientX' | 'clientY'>, rect: DOMRect): InkPoint => ({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
  });
  const cancel = () => { pointer.current = null; live.current = null; setDraft(null); };
  return <svg className={`ink ${enabled ? 'active' : ''}`} viewBox={`0 0 ${width} ${height}`} aria-label="طبقة الشرح"
    onPointerDown={event => {
      if (!enabled || !event.isPrimary || event.button !== 0 || pointer.current !== null || strokes.length >= 200) return;
      event.preventDefault(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      live.current = { color, width: Math.min(1, size / Math.max(1, rect.width)), opacity: highlighter ? 0.3 : 1, points: [point(event, rect)] };
      setDraft(live.current);
    }}
    onPointerMove={event => {
      if (!enabled || event.pointerId !== pointer.current || !live.current || live.current.points.length >= 3000) return;
      const coalesced = event.nativeEvent.getCoalescedEvents?.();
      const samples = coalesced?.length ? coalesced : [event];
      const rect = event.currentTarget.getBoundingClientRect();
      const points = samples.map(sample => point(sample, rect));
      const next = { ...live.current, points: [...live.current.points, ...points].slice(0, 3000) };
      live.current = next; setDraft(next);
    }}
    onPointerUp={event => {
      if (event.pointerId !== pointer.current) return;
      const finished = live.current;
      cancel();
      if (finished) { const next = [...strokes, finished]; if (onChange) onChange(next); else setInternal(next); }
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    {[...strokes, ...(enabled && draft ? [draft] : [])].map((stroke, index) => <StrokeShape key={index} stroke={stroke} width={width} height={height} />)}
  </svg>;
}
