import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };
export function Ink({ enabled, color, width, height }: {
  enabled: boolean; color: string; width: number; height: number;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const live = useRef<Stroke | null>(null);
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / rect.width)),
      y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / rect.height)) };
  };
  return <svg className={`ink ${enabled ? 'active' : ''}`} viewBox={`0 0 ${width} ${height}`} aria-label="طبقة شرح مؤقتة"
    onPointerDown={event => {
      if (!enabled || !event.isPrimary || event.button !== 0 || pointer.current !== null) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      live.current = { color, width: 3 * width / rect.width, points: [point(event)] };
      setDraft(live.current);
    }}
    onPointerMove={event => {
      if (!enabled || event.pointerId !== pointer.current || !live.current || live.current.points.length >= 10_000) return;
      const next = { ...live.current, points: [...live.current.points, point(event)] };
      live.current = next;
      setDraft(next);
    }}
    onPointerUp={event => {
      if (event.pointerId !== pointer.current) return;
      const finished = live.current;
      if (finished) setStrokes(prev => [...prev.slice(-199), finished]);
      pointer.current = null; live.current = null; setDraft(null);
    }}
    onPointerCancel={() => { pointer.current = null; live.current = null; setDraft(null); }}
    onLostPointerCapture={() => { pointer.current = null; live.current = null; setDraft(null); }}>
    {[...strokes, ...(draft ? [draft] : [])].map((stroke, index) => stroke.points.length === 1
      ? <circle key={index} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill={stroke.color} />
      : <polyline key={index} points={stroke.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>;
}
