import React from 'react';
import {
  Camera,
  Check,
  FileUp,
  History,
  Radio,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ReaderController } from '../../app/useReaderController';
import type { BeamTransferState } from '../types';
import { formatBeamBytes } from './beamUtils';

export const BeamSendTab: React.FC<{
  lang: Language;
  reader: ReaderController;
  beamFileInputRef: React.RefObject<HTMLInputElement | null>;
  isScanningCamera: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stopCamera: () => void;
  startCameraScanner: () => void;
  cameraError: string | null;
  recentRooms: string[];
  setTargetRoomCode: (code: string) => void;
  handleBeamDocument: (overrideCode?: string) => Promise<void>;
  handlePairAsRemote: (overrideCode?: string) => void;
  transfer: BeamTransferState;
  transferPhaseText: string | null;
  beamError: string | null;
  targetRoomCode: string;
  isSending: boolean;
  sendSuccess: boolean;
}> = ({
  lang,
  reader,
  beamFileInputRef,
  isScanningCamera,
  videoRef,
  stopCamera,
  startCameraScanner,
  cameraError,
  recentRooms,
  setTargetRoomCode,
  handleBeamDocument,
  handlePairAsRemote,
  transfer,
  transferPhaseText,
  beamError,
  targetRoomCode,
  isSending,
  sendSuccess,
}) => (
  <div className="p-5 space-y-3.5">
    {reader.doc ? (
      <div className="px-3.5 py-2.5 rounded-2xl bg-hover-subtle border border-line flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-accent font-semibold uppercase tracking-wider">
            {lang === 'ar' ? 'الملف الجاهز للبث' : 'Ready Document'}
          </div>
          <div className="text-xs font-bold truncate text-ink">{reader.docTitle}</div>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">
          {lang === 'ar' ? `ص ${reader.currentPage}` : `p. ${reader.currentPage}`}
        </span>
      </div>
    ) : (
      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-start">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          <Radio className="w-3.5 h-3.5 animate-pulse text-amber-500" />
          <span>{lang === 'ar' ? 'لا يوجد ملف مفتوح حالياً على الهاتف' : 'No document open on phone'}</span>
        </div>
        <p className="text-[11px] text-ink-muted leading-tight">
          {lang === 'ar'
            ? 'اختر ملف الملزمة لبثها للسبورة، أو اتصل كريموت تحكم إذا كانت معروضة بالفعل على شاشة السبورة:'
            : 'Pick a PDF file to beam to smartboard, or pair as remote if already displayed on screen:'}
        </p>
        <button
          type="button"
          onClick={() => beamFileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:bg-accent-strong transition-all cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? '📂 اختيار ملف الملزمة وبثها الآن' : '📂 Select PDF & Beam to Board'}</span>
        </button>
      </div>
    )}

    <div className="grid grid-cols-2 gap-2 text-start p-2.5 rounded-2xl bg-hover-subtle/80 border border-line-subtle text-[11px]">
      <div className="flex items-start gap-1.5">
        <span className="w-4 h-4 rounded-full bg-accent/20 text-accent font-mono font-bold flex items-center justify-center shrink-0 text-[10px]">
          ١
        </span>
        <span className="text-ink-muted leading-tight">
          {lang === 'ar' ? 'على السبورة: افتح الرابط ' : 'On Board: Open '}
          <strong className="text-accent font-mono font-bold">xrtm8.github.io/Otium-Lab/</strong>
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <span className="w-4 h-4 rounded-full bg-accent/20 text-accent font-mono font-bold flex items-center justify-center shrink-0 text-[10px]">
          ٢
        </span>
        <span className="text-ink-muted leading-tight">
          {lang === 'ar' ? 'امسح الـ QR أو اكتب الكود' : 'Scan QR or enter Code'}
        </span>
      </div>
    </div>

    {isScanningCamera ? (
      <div className="relative w-full h-48 rounded-2xl bg-black overflow-hidden border-2 border-accent flex flex-col items-center justify-center shadow-inner">
        <video ref={videoRef} className="w-full h-full object-cover" />
        <div className="absolute inset-0 border-2 border-dashed border-accent/70 m-6 rounded-xl pointer-events-none animate-pulse" />
        <div className="absolute bottom-2 px-3 py-1 bg-black/75 backdrop-blur-sm rounded-full text-[10px] text-white">
          {lang === 'ar' ? 'وجّه الكاميرا نحو QR السبورة' : 'Point camera at Smartboard QR'}
        </div>
        <button
          type="button"
          onClick={stopCamera}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={startCameraScanner}
        className="w-full py-2.5 px-4 rounded-2xl bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center gap-2 hover:bg-accent/25 active:scale-98 transition-all cursor-pointer shadow-xs"
      >
        <Camera className="w-4 h-4" />
        <span>{lang === 'ar' ? 'مسح رمز السبورة بالكاميرا فوراً' : 'Scan Smartboard QR with Camera'}</span>
      </button>
    )}

    {cameraError && (
      <div className="text-[10px] text-amber-500 text-center font-medium">{cameraError}</div>
    )}

    {recentRooms.length > 0 && !isScanningCamera && (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[10px] text-ink-muted">
          <History className="w-3 h-3" />
          <span>{lang === 'ar' ? 'القاعات السابقة:' : 'Recent Rooms:'}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {recentRooms.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => {
                setTargetRoomCode(room);
                void handleBeamDocument(room);
              }}
              className="px-2.5 py-1 rounded-xl bg-hover border border-line text-[11px] font-mono font-semibold text-accent hover:bg-accent/15 hover:border-accent/40 active:scale-95 transition-all cursor-pointer"
            >
              {room}
            </button>
          ))}
        </div>
      </div>
    )}

    {transfer.active && transfer.direction === 'send' && (
      <div className="p-3 rounded-2xl bg-accent/10 border border-accent/25 space-y-2 text-start animate-in fade-in duration-150">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-accent">
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{transferPhaseText || (lang === 'ar' ? 'جارٍ الإرسال…' : 'Sending…')}</span>
          </span>
          <span className="font-mono">
            {formatBeamBytes(transfer.bytesTransferred)} / {formatBeamBytes(transfer.totalBytes)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-accent/15 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-200"
            style={{ width: `${Math.max(2, transfer.progress)}%` }}
          />
        </div>
        {transfer.phase === 'waiting-peer' && (
          <p className="text-[10px] text-ink-muted leading-tight">
            {lang === 'ar'
              ? 'تأكد أن الحاسبة مفتوحة على نافذة «استقبال» بنفس الرمز. سيتم الاتصال تلقائياً.'
              : 'Keep the PC on the Receiver tab with the same code. Pairing retries automatically.'}
          </p>
        )}
      </div>
    )}

    {beamError && (
      <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-danger-ink text-xs font-sans text-center">
        {beamError}
      </div>
    )}

    <div className="space-y-2">
      <input
        type="text"
        value={targetRoomCode}
        onChange={(e) => setTargetRoomCode(e.target.value.toUpperCase())}
        placeholder="OTM-XXXXXXXXXXXX"
        className="w-full px-3 py-2.5 rounded-2xl bg-hover border border-line font-mono text-sm font-bold text-center tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="flex flex-col gap-2">
        {reader.doc ? (
          <button
            type="button"
            onClick={() => void handleBeamDocument()}
            disabled={isSending || !targetRoomCode.trim()}
            className="w-full py-3 px-3 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
          >
            {isSending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : sendSuccess ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>
              {transferPhaseText
                ? transferPhaseText
                : lang === 'ar'
                  ? 'بث ومزامنة للسبورة فوراً'
                  : 'Beam & Sync to Smartboard'}
            </span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => beamFileInputRef.current?.click()}
              disabled={isSending}
              className="w-full py-2.5 px-3 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? '📂 اختيار ملف وبثه للسبورة' : '📂 Select PDF & Beam to Board'}</span>
            </button>

            <button
              type="button"
              onClick={() => handlePairAsRemote()}
              disabled={!targetRoomCode.trim()}
              className="w-full py-2 px-3 rounded-2xl bg-hover border border-line hover:border-accent/40 text-ink text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/15 active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-accent" />
              <span>
                {lang === 'ar'
                  ? '📱 اقتران كريموت فقط (إذا كانت الملزمة مفتوحة بالسبورة)'
                  : '📱 Pair as Remote Only (if PDF is on screen)'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  </div>
);
