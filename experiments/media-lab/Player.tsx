import { useEffect, useRef, useState } from 'react';
import { formatTime, mediaErrorMessage } from './media';

export function Player({ url, audio, frozen, onSize, onError }: {
  url?: string; audio?: boolean; frozen: boolean;
  onSize: (width: number, height: number) => void; onError: (message: string) => void;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    if (url) {
      // React's development StrictMode replays cleanup/setup without replacing
      // the DOM node, so setup must restore the src removed by cleanup.
      element.srcObject = null;
      element.src = url;
      element.load();
    }
    return () => { element.pause(); element.srcObject = null; element.removeAttribute('src'); element.load(); };
  }, [url, onError]); // Each source gets a fresh Player instance.
  useEffect(() => { if (frozen) media.current?.pause(); }, [frozen]);
  return <>
    <video ref={media} src={url} playsInline preload="metadata" muted={muted} className={audio ? 'audio-element' : ''}
      onLoadedMetadata={event => {
        const element = event.currentTarget;
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
        if (element.videoWidth) onSize(element.videoWidth, element.videoHeight);
      }}
      onResize={event => { const element = event.currentTarget; if (element.videoWidth) onSize(element.videoWidth, element.videoHeight); }}
      onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onError={event => onError(mediaErrorMessage(event.currentTarget.error?.code))} />
    {audio && <div className="audio-art"><span>♫</span><p>مساحة استماع وشرح</p></div>}
    {!frozen && <div className="player-controls" aria-label="التحكم بالوسائط" onPointerDown={event => event.stopPropagation()}>
      <button onClick={() => {
        const element = media.current;
        if (!element) return;
        if (element.paused) void element.play().catch(() => onError('تعذّر بدء التشغيل؛ تحقق من ترميز الملف وصلاحية تشغيل الصوت.'));
        else element.pause();
      }}>{playing ? 'إيقاف مؤقت' : 'تشغيل'}</button>
      <>
        <span className="clock">{formatTime(time)} / {formatTime(duration)}</span>
        <input aria-label="موضع التشغيل" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration)} disabled={!duration}
          onChange={event => { if (media.current) media.current.currentTime = Number(event.target.value); }} />
        <select aria-label="سرعة التشغيل" value={rate} onChange={event => { const next = Number(event.target.value); setRate(next); if (media.current) media.current.playbackRate = next; }}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
      </>
      <button aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'تشغيل الصوت' : 'كتم الصوت'}</button>
    </div>}
  </>;
}
