import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { describeFile, validateFile, fitSize, SourceLease, captureErrorMessage, powerPointEmbedUrl } from './media';
import type { FileKind } from './media';
import { Ink } from './Ink';
import { Player } from './Player';
import sampleVideo from './samples/lesson.mp4?url';

type Source = { id: number; name: string; kind: FileKind | 'online-presentation'; url?: string; stream?: MediaStream; text?: string };
const Pdf = lazy(() => import('./Pdf').then(module => ({ default: module.Pdf })));

export function Lab() {
  const lease = useRef(new SourceLease());
  const input = useRef<HTMLInputElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [embedLink, setEmbedLink] = useState('');
  const [focus, setFocus] = useState(false);
  const [draw, setDraw] = useState(false);
  const [revision, setRevision] = useState(0);
  const [color, setColor] = useState('#ffcf63');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 900 });
  const [space, setSpace] = useState({ width: 960, height: 540 });
  useEffect(() => () => { lease.current.replace(); }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSpace({ width, height });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const reset = () => {
    const ticket = lease.current.replace();
    setSource(null); setDraw(false); setFocus(false); setError(''); setNotice(''); setPage(1); setTotal(1);
    setDimensions({ width: 1600, height: 900 }); setBusy(false);
    return ticket;
  };
  const open = async (file?: File) => {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) { setError(problem); return; }
    const ticket = reset();
    const { kind, mime } = describeFile(file.name);
    if (kind === 'presentation' || kind === 'office') {
      setSource({ id: ticket, name: file.name, kind });
      return;
    }
    setBusy(true);
    try {
      if ((kind === 'video' || kind === 'audio') && !document.createElement(kind).canPlayType(mime)) {
        setNotice('المتصفح لا يعلن دعم هذه الصيغة. سنحاول فتحها، وقد تحتاج تحويلها إلى MP4 أو WebM.');
      }
      if (kind === 'text') {
        const text = await file.text();
        if (lease.current.current(ticket)) setSource({ id: ticket, name: file.name, kind, text });
      } else {
        // Extension-derived MIME handles camera files whose browser File.type is empty.
        const url = lease.current.file(ticket, file.type === mime ? file : file.slice(0, file.size, mime));
        if (url) setSource({ id: ticket, name: file.name, kind, url });
      }
    } catch {
      if (lease.current.current(ticket)) setError('تعذّر قراءة الملف. أعد اختياره من مساحة تخزين الجهاز.');
    } finally { if (lease.current.current(ticket)) setBusy(false); }
  };
  const capture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('التقاط النافذة يحتاج متصفح حاسب يدعم مشاركة الشاشة. هو غير متاح عادةً في متصفح الهاتف.');
      return;
    }
    const ticket = reset();
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
      if (!lease.current.capture(ticket, stream)) return;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') { reset(); setError('انتهت مشاركة النافذة قبل بدء المعاينة.'); return; }
      track.addEventListener('ended', () => {
        if (lease.current.current(ticket)) { reset(); setNotice('انتهت مشاركة النافذة. يمكنك اختيار نافذة أخرى.'); }
      }, { once: true });
      const settings = track.getSettings();
      if (settings.width && settings.height) setDimensions({ width: settings.width, height: settings.height });
      setSource({ id: ticket, name: 'معاينة نافذة العرض', kind: 'video', stream });
      setNotice('تحكّم بالحركات من نافذة المصدر. اختيار نافذة Otium نفسها يسبب انعكاساً متكرراً. الصوت يعتمد على خيار المشاركة في المتصفح.');
    } catch (error) {
      if (lease.current.current(ticket)) setError(captureErrorMessage(error));
    } finally { if (lease.current.current(ticket)) setBusy(false); }
  };
  const openEmbed = () => {
    const url = powerPointEmbedUrl(embedLink);
    if (!url) { setError('أدخل رابط تضمين OneDrive الرسمي بصيغة https://onedrive.live.com/embed?resid=…، وليس رابط مشاركة قصيراً أو كود HTML.'); return; }
    const ticket = reset();
    setEmbedLink('');
    setSource({ id: ticket, name: 'PowerPoint عبر Microsoft · متصل بالإنترنت', kind: 'online-presentation', url });
    setNotice('العرض هنا من Microsoft ويستخدم اتصالاً خارجياً. التوافق وصلاحية الرابط يحددهما العارض؛ لا يوجد بث هاتف أو شرح Otium فوق هذا العارض بعد.');
  };
  const onlineForm = <section className="online-form" aria-label="عرض PowerPoint من OneDrive">
    <h2>PowerPoint من OneDrive</h2>
    <p>خيار متصل بالإنترنت للحركات والفيديو. من OneDrive اختر تضمين العرض، ثم انسخ عنوان src من كود التضمين. فتح الرابط يتصل بخدمة Microsoft؛ لا يرفع الملف المحلي ولا يغيّر صلاحيات مشاركته.</p>
    <div><input aria-label="رابط تضمين PowerPoint" type="url" dir="ltr" autoComplete="off" spellCheck={false} placeholder="https://onedrive.live.com/embed?resid=…" value={embedLink} onChange={event => setEmbedLink(event.target.value)} />
      <button onClick={openEmbed} disabled={!embedLink.trim()}>فتح عبر Microsoft</button></div>
  </section>;
  const size = fitSize(space, dimensions);
  const visual = source && ['video', 'audio', 'image', 'pdf'].includes(source.kind);
  const office = source?.kind === 'presentation' || source?.kind === 'office';
  return <div className={`lab-shell ${focus ? 'focused' : ''}`} ref={shell}>
    {!focus && <header>
      <div><strong>Otium <span>مختبر الوسائط</span></strong><p>تجربة منفصلة · بلا رفع تلقائي للملفات</p></div>
      <div className="header-actions">
        <button className="primary" onClick={() => input.current?.click()}>فتح ملف</button>
        <button onClick={() => void capture()} disabled={busy}>التقاط نافذة عرض</button>
        {source && <button onClick={reset}>إغلاق الملف</button>}
      </div>
    </header>}
    <input ref={input} hidden type="file" accept=".mp4,.m4v,.webm,.mov,.mkv,.ogv,.mp3,.wav,.m4a,.ogg,.opus,.flac,.png,.jpg,.jpeg,.webp,.gif,.avif,.pdf,.txt,.md,.ppt,.pptx,.pps,.ppsx,.doc,.docx,.xls,.xlsx"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void open(file); }} />
    {!focus && (error || notice) && <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error || notice}</span><button aria-label="إغلاق الرسالة" onClick={() => { setError(''); setNotice(''); }}>×</button>
    </div>}
    {focus && error && <div className="focus-error" role="alert">{error}</div>}
    <main ref={stage} className="stage">
      {busy && <div className="empty"><h2>جارٍ تجهيز المصدر…</h2><button onClick={reset}>إلغاء</button></div>}
      {!busy && !source && <section className="welcome">
        <span className="eyebrow">مساحة الدرس</span><h1>الفيديو والشرح، في مساحة واحدة.</h1>
        <p>افتح ملفاً من الجهاز، شغّله أو أوقفه، ثم اكتب فوق اللقطة بقلم متجهي. هذه تجربة للعرض المحلي وليست تحديثاً منشوراً أو بثاً إلى الهاتف.</p>
        <div className="format-grid">
          <article><h2>فيديو وصوت</h2><p>تشغيل وتقديم وسرعة وصوت. نجاح التشغيل يعتمد على ترميز الملف والمتصفح.</p></article>
          <article><h2>صور وPDF ونصوص</h2><p>عرض محلي، تقليب PDF، وقلم للشرح فوق الصور والصفحات.</p></article>
          <article><h2>PowerPoint بالحركات</h2><p>مسار تجريبي: افتح العرض بمحركه الأصلي والتقط نافذته. فتح PPTX تفاعلياً داخل Otium لم يُنفّذ بعد.</p></article>
        </div>
        <button className="primary" onClick={() => input.current?.click()}>اختر ملفاً للتجربة</button>
        <button className="sample-play" onClick={() => { const ticket = reset(); setSource({ id: ticket, name: 'فيديو اختبار محلي', kind: 'video', url: sampleVideo }); }}>تشغيل فيديو الاختبار</button>
        <a className="sample-link" href={sampleVideo} download="otium-media-test.mp4">تنزيل فيديو اختبار قصير</a>
        {onlineForm}
      </section>}
      {!busy && visual && <div className="surface" style={{ width: size.width, height: size.height }}>
        {(source.kind === 'video' || source.kind === 'audio') && <Player key={source.id} url={source.url} stream={source.stream} audio={source.kind === 'audio'} frozen={draw}
          onSize={(width, height) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height })}
          onError={setError} />}
        {source.kind === 'image' && <img src={source.url} alt={source.name} onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('تعذّر فك ترميز الصورة. جرّب PNG أو JPEG سليماً.')} />}
        {source.kind === 'pdf' && <Suspense fallback={<p>تحميل قارئ PDF…</p>}><Pdf key={source.id} url={source.url!} page={page}
          onReady={(width, height, count) => { setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height }); setTotal(count); }} onError={setError} /></Suspense>}
        <Ink key={`${source.id}:${page}:${revision}:${dimensions.width}:${dimensions.height}`} enabled={draw} color={color} width={dimensions.width} height={dimensions.height} />
      </div>}
      {!busy && source?.kind === 'text' && <pre className="text-document" dir="auto">{source.text}</pre>}
      {!busy && source?.kind === 'online-presentation' && <iframe className="online-frame" title="عارض Microsoft PowerPoint" src={source.url}
        style={{ width: size.width, height: size.height }} referrerPolicy="no-referrer"
        onError={() => { if (lease.current.current(source.id)) setError('تعذّر تحميل عارض Microsoft. تحقق من الإنترنت وصلاحية رابط التضمين وإعدادات المشاركة.'); }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups" allow="fullscreen; autoplay" allowFullScreen />}
      {!busy && office && <section className="office-card">
        <span className="eyebrow">{source?.name}</span>
        <h1>{source.kind === 'presentation' ? 'الحركات تحتاج محرك عرض حقيقياً.' : 'مستندات Office تحتاج مسار عرض مخصصاً.'}</h1>
        <p>{source.kind === 'presentation' ? 'الملف لم يُرفع ولم يُحوّل. تحويل PowerPoint إلى PDF يفقد الحركة والفيديو، وتشغيله عبر محرك ويب لا يضمن كل المؤثرات.' : 'لم يُقرأ محتوى الملف ولم يُرفع إلى أي خدمة. يمكنك تجربة عرض نافذة Word أو Excel هنا. الفتح المباشر لهذه الصيغ لم يُنفّذ بعد.'}</p>
        <ol>
          <li>{source.kind === 'presentation' ? 'افتح العرض في PowerPoint على الحاسب، وابدأ عرض الشرائح في نافذة.' : 'افتح المستند في Word أو Excel على الحاسب.'}</li>
          <li>اضغط «التقاط نافذة عرض» واختر نافذة الشرائح، وليس Otium.</li>
          <li>ستظهر الحركة هنا؛ التحكم بالشرائح يبقى في المصدر. هذه معاينة تجريبية وليست دمجاً تفاعلياً كاملاً.</li>
        </ol>
        <button className="primary" onClick={() => void capture()}>التقاط نافذة عرض</button>
        <p className="small">بديل للعرض الخطي: صدّر العرض إلى MP4 من PowerPoint وافتح الفيديو هنا. النقرات التفاعلية تصبح توقيتاً مسجلاً.</p>
        {source.kind === 'presentation' && onlineForm}
      </section>}
    </main>
    {!focus && <footer>
      <div className="source-name"><strong>{source?.name ?? 'جاهز للتجربة'}</strong><span>{draw ? 'الشرح مؤقت؛ تشغيل الوسائط متوقف في المعاينة.' : 'اختبار محلي · لا يوجد بث إلى جهاز آخر في هذه التجربة'}</span></div>
      <nav aria-label="أدوات مساحة العرض">
        {visual && <>
          <button aria-pressed={draw} onClick={() => { setDraw(value => !value); if (draw) setRevision(value => value + 1); }}>{draw ? 'إنهاء الشرح' : 'شرح اللقطة'}</button>
          {draw && <><input aria-label="لون القلم" type="color" value={color} onChange={event => setColor(event.target.value)} /><button onClick={() => setRevision(value => value + 1)}>مسح الشرح</button></>}
          {source?.kind === 'pdf' && <div className="pager" dir="ltr"><button aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button><span>{page} / {total}</span><button aria-label="الصفحة التالية" disabled={page >= total} onClick={() => setPage(value => value + 1)}>›</button></div>}
        </>}
        {source && <button onClick={() => setFocus(true)}>إخفاء الأدوات</button>}
        <button onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => setError('تعذّر إنهاء ملء الشاشة.'));
          else if (shell.current?.requestFullscreen) void shell.current.requestFullscreen().catch(() => setError('ملء الشاشة غير متاح في هذا المتصفح.'));
          else setError('ملء الشاشة غير متاح في هذا المتصفح.');
        }}>ملء الشاشة</button>
      </nav>
    </footer>}
    {focus && <button className="restore" onClick={() => setFocus(false)}>إظهار الأدوات{source?.kind === 'pdf' ? ` · ${page} / ${total}` : ''}</button>}
  </div>;
}
