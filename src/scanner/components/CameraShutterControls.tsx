import React from 'react';
import { ArrowLeft, CreditCard, FileText, Image as ImageIcon, ScanLine } from 'lucide-react';

interface CameraShutterControlsProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  scanMode: 'batch' | 'single' | 'idcard';
  autoCapture: boolean;
  effectiveStabilityProgress: number;
  pagesCount: number;
  onSelectScanMode: (mode: 'batch' | 'single' | 'idcard') => void;
  capturing: boolean;
  onCaptureClick: () => void;
  onFinishBatchClick: () => void;
  lastThumbnail?: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CameraShutterControls: React.FC<CameraShutterControlsProps> = ({
  fileInputRef,
  scanMode,
  autoCapture,
  effectiveStabilityProgress,
  pagesCount,
  onSelectScanMode,
  capturing,
  onCaptureClick,
  onFinishBatchClick,
  lastThumbnail,
  onFileChange,
}) => (
  <>
    <div className="relative z-20 flex justify-center py-2.5 px-4 bg-gradient-to-t from-[#07090e] via-[#07090e]/90 to-transparent">
      <div className="flex items-center p-1 rounded-full bg-white/[0.08] border border-white/[0.1] shadow-lg">
        <button
          onClick={() => onSelectScanMode('batch')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'batch' ? 'bg-white text-black shadow-lg shadow-white/20' : 'text-gray-300 hover:text-white'
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>متعدد (دفعة)</span>
        </button>
        <button
          onClick={() => onSelectScanMode('single')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'single' ? 'bg-white text-black shadow-lg shadow-white/20' : 'text-gray-300 hover:text-white'
          }`}
        >
          مفرد
        </button>
        <button
          onClick={() => onSelectScanMode('idcard')}
          className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'idcard' ? 'bg-white text-black shadow-lg shadow-white/20' : 'text-gray-300 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>هوية</span>
        </button>
      </div>
    </div>

    <div
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 32px)' }}
      className="relative z-20 flex items-center justify-around px-8 pt-3 bg-gradient-to-t from-black via-black/80 to-transparent border-t border-white/[0.06]"
    >
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 active:scale-90 transition-all cursor-pointer"
        title="استيراد من المعرض"
      >
        <ImageIcon className="w-5 h-5 text-gray-200" />
        <span className="text-[10px] text-gray-400 font-bold font-arabic">المعرض</span>
      </button>

      <div className="relative flex items-center justify-center">
        {autoCapture && effectiveStabilityProgress > 0 && (
          <svg className="absolute -inset-2 w-24 h-24 -rotate-90 pointer-events-none z-10" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="4" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="#10B981"
              strokeWidth="4"
              strokeDasharray="289"
              strokeDashoffset={289 - (289 * effectiveStabilityProgress) / 100}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-150"
            />
          </svg>
        )}

        <button
          onClick={onCaptureClick}
          disabled={capturing}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full border-2 p-1.5 active:scale-90 transition-all disabled:opacity-50 cursor-pointer shadow-2xl ${
            autoCapture && effectiveStabilityProgress > 0
              ? 'border-emerald-400 shadow-emerald-500/30'
              : 'border-white/70 hover:border-white shadow-black/80'
          }`}
          title="التقاط صورة"
        >
          <div
            className={`w-full h-full rounded-full flex items-center justify-center shadow-lg transition-all ${
              autoCapture && effectiveStabilityProgress > 0 ? 'bg-emerald-500' : 'bg-white hover:bg-white/95'
            }`}
          >
            <div className={`w-14 h-14 rounded-full border border-black/10 flex items-center justify-center ${capturing ? 'scale-90 bg-gray-200' : ''}`}>
              <div className="w-3 h-3 rounded-full bg-black/20" />
            </div>
          </div>
        </button>
      </div>

      {pagesCount > 0 ? (
        <button
          onClick={onFinishBatchClick}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform group cursor-pointer"
          title="إنهاء ومراجعة ملف الـ PDF"
        >
          <div className="relative w-14 h-14 rounded-2xl border-2 border-emerald-500/80 bg-black overflow-hidden shadow-xl ring-2 ring-emerald-500/30">
            {lastThumbnail ? (
              <img src={lastThumbnail} alt="Page preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/40">
                <FileText className="w-6 h-6 text-emerald-400" />
              </div>
            )}
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center ring-2 ring-black shadow-md">
              {pagesCount}
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-400 font-arabic flex items-center gap-1">
            <span>إنهاء ومراجعة</span>
            <ArrowLeft className="w-3 h-3" />
          </span>
        </button>
      ) : (
        <div className="w-14 h-14 flex items-center justify-center opacity-30">
          <FileText className="w-6 h-6 text-gray-500" />
        </div>
      )}
    </div>

    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={onFileChange}
      className="hidden"
    />
  </>
);
