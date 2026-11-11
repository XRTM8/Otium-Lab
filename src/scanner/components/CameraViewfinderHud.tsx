import React from 'react';
import {
  Camera,
  Image as ImageIcon,
  Zap,
  ZapOff,
  ScanLine,
  CreditCard,
  FileCheck2,
  FileText,
  RefreshCw,
  Settings,
  ArrowLeft,
  X,
  Sparkles,
} from 'lucide-react';
import { OtiumLogo } from './OtiumLogo';

export interface CameraViewfinderHudProps {
  flashAnimation: boolean;
  captureToast: string;
  idStatusToast: string;
  hasClose: boolean;
  onCloseClick: () => void;
  onOpenLibraryClick: () => void;
  autoCapture: boolean;
  onToggleAutoCapture: () => void;
  torchOn: boolean;
  onToggleTorch: () => void;
  onFlipCamera: () => void;
  onOpenSettingsClick: () => void;
  viewfinderRef: React.RefObject<HTMLDivElement | null>;
  onViewfinderTap: (e: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoLoadedMetadata: () => void;
  viewfinderFit: 'contain' | 'cover';
  focusPoint: { x: number; y: number } | null;
  hasPermission: boolean | null;
  onRetryCamera: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  scanMode: 'batch' | 'single' | 'idcard';
  idCardStep: 'front' | 'back';
  renderedBounds: { x: number; y: number; width: number; height: number } | null;
  effectiveLiveDocPresent: boolean;
  effectiveStabilityProgress: number;
  pagesCount: number;
  onSelectScanMode: (mode: 'batch' | 'single' | 'idcard') => void;
  capturing: boolean;
  onCaptureClick: () => void;
  onFinishBatchClick: () => void;
  lastThumbnail?: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CameraViewfinderHud: React.FC<CameraViewfinderHudProps> = ({
  flashAnimation,
  captureToast,
  idStatusToast,
  hasClose,
  onCloseClick,
  onOpenLibraryClick,
  autoCapture,
  onToggleAutoCapture,
  torchOn,
  onToggleTorch,
  onFlipCamera,
  onOpenSettingsClick,
  viewfinderRef,
  onViewfinderTap,
  videoRef,
  onVideoLoadedMetadata,
  viewfinderFit,
  focusPoint,
  hasPermission,
  onRetryCamera,
  fileInputRef,
  scanMode,
  idCardStep,
  renderedBounds,
  effectiveLiveDocPresent,
  effectiveStabilityProgress,
  pagesCount,
  onSelectScanMode,
  capturing,
  onCaptureClick,
  onFinishBatchClick,
  lastThumbnail,
  onFileChange,
}) => (
  <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans">
    {/* Visual Shutter Flash */}
    {flashAnimation && <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-150" />}

    {/* Floating Status Toast */}
    {captureToast && (
      <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
        <span className="px-5 py-2.5 rounded-full bg-accent text-on-accent font-black text-xs shadow-2xl border border-white/20 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4" />
          <span>{captureToast}</span>
        </span>
      </div>
    )}

    {/* Floating ID Card Status Toast */}
    {idStatusToast && (
      <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
        <span className="px-4 py-2.5 rounded-2xl bg-accent text-on-accent font-bold text-xs shadow-2xl flex items-center gap-2 border border-white/20">
          <CreditCard className="w-4 h-4" />
          <span>{idStatusToast}</span>
        </span>
      </div>
    )}

    {/* Minimalist Safe-Area Header */}
    <div
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px) + 16px, 16px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px) + 16px, 16px)',
      }}
      className="relative z-30 flex items-center justify-between pb-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent select-none"
    >
      {/* Right side (RTL): Close & Vault */}
      <div className="flex items-center gap-2">
        {hasClose && (
          <button
            onClick={onCloseClick}
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg cursor-pointer"
            title="إغلاق الماسح الضوئي"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Vault Archive Shortcut */}
        <button
          onClick={onOpenLibraryClick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-bold text-gray-200 active:scale-95 transition-transform shadow-lg cursor-pointer"
          title="خزنة المستندات المحفوظة"
        >
          <OtiumLogo size={16} className="text-white shrink-0" />
          <span className="text-xs">الخزنة</span>
        </button>
      </div>

      {/* Center: Auto / Manual Intelligence Toggle Pill */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleAutoCapture}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-lg transition-all cursor-pointer ${
            autoCapture
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-emerald-500/20 ring-1 ring-emerald-500/40'
              : 'bg-black/60 text-gray-300 border-white/10 hover:text-white'
          }`}
          title="تبديل الالتقاط التلقائي عند ثبات المستند"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-xs font-arabic font-bold">{autoCapture ? 'تلقائي' : 'يدوي'}</span>
        </button>
      </div>

      {/* Left side: Quick Controls (Flash, Flip, Settings) */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleTorch}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            torchOn
              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50 shadow-lg shadow-amber-500/20'
              : 'bg-black/60 hover:bg-black/90 text-gray-300 border border-white/15'
          } active:scale-90`}
          title="فلاش الكاميرا"
        >
          {torchOn ? <Zap className="w-4 h-4 fill-accent text-accent" /> : <ZapOff className="w-4 h-4" />}
        </button>

        <button
          onClick={onFlipCamera}
          className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-gray-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
          title="تبديل الكاميرا (أمامية / خلفية)"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettingsClick}
          className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-gray-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
          title="الإعدادات والتحديثات"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* Main Viewfinder Screen */}
    <div
      ref={viewfinderRef}
      onClick={onViewfinderTap}
      className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-crosshair"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        onLoadedMetadata={onVideoLoadedMetadata}
        className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-200 ${
          viewfinderFit === 'contain' ? 'object-contain' : 'object-cover'
        }`}
      />

      {/* Tap-to-Focus Animated Reticle */}
      {focusPoint && (
        <div
          style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
        >
          <div className="w-14 h-14 rounded-full border-2 border-accent bg-accent/15 animate-ping" />
          <div className="absolute inset-0 w-14 h-14 rounded-full border border-accent shadow-lg" />
        </div>
      )}

      {/* Camera Loading State */}
      {hasPermission === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 backdrop-blur-md p-6 text-center z-30 pointer-events-none animate-in fade-in duration-200">
          <div className="relative w-16 h-16 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-accent animate-ping opacity-40" />
            <Camera className="w-8 h-8 text-accent animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white font-arabic">جاري تشغيل الكاميرا...</p>
            <p className="text-[11px] text-gray-400 font-arabic">تهيئة المستشعر وعدسة المسح</p>
          </div>
        </div>
      )}

      {/* Fallback state when permission is pending or denied */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 p-6 text-center z-30">
          <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Camera className="w-8 h-8 text-accent" />
          </div>
          <h3 className="text-base font-bold text-white font-arabic">إذن الكاميرا مطلوب</h3>
          <p className="text-xs text-gray-400 max-w-xs leading-relaxed font-arabic">
            يرجى منح صلاحية الكاميرا لمسح المستندات وتجميعها في ملف PDF، أو اختر صوراً من الاستوديو.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={onRetryCamera}
              className="px-5 py-2.5 bg-accent text-on-accent font-bold text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
            >
              تفعيل الكاميرا
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 glass-button text-gray-300 font-medium text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
            >
              اختيار من المعرض
            </button>
          </div>
        </div>
      )}

      {/* Dedicated ID Card Aspect Ratio Framing Guide */}
      {scanMode === 'idcard' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="relative w-[84%] max-w-[340px] aspect-[1.58/1] rounded-3xl border-2 border-dashed border-accent/70 bg-accent/[0.04] flex flex-col items-center justify-center gap-2 shadow-2xl backdrop-blur-[1px]">
            <CreditCard className="w-8 h-8 text-accent animate-pulse" />
            <span className="text-xs font-bold font-arabic text-accent bg-black/75 px-3 py-1 rounded-full border border-accent/30 shadow-md">
              {idCardStep === 'front' ? 'الوجه الأمامي للبطاقة' : 'الوجه الخلفي للبطاقة'}
            </span>
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-accent rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-accent rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-accent rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-accent rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Exact Sensor Framing Boundary */}
      {renderedBounds && scanMode !== 'idcard' && (
        <div
          style={{
            left: `${renderedBounds.x}px`,
            top: `${renderedBounds.y}px`,
            width: `${renderedBounds.width}px`,
            height: `${renderedBounds.height}px`,
          }}
          className={`pointer-events-none absolute border transition-all duration-200 ${
            effectiveLiveDocPresent ? 'border-emerald-500/40' : 'border-accent/25'
          }`}
        >
          <div
            className={`absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 transition-colors ${
              effectiveLiveDocPresent ? 'border-emerald-400' : 'border-accent'
            }`}
          />
          <div
            className={`absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 transition-colors ${
              effectiveLiveDocPresent ? 'border-emerald-400' : 'border-accent'
            }`}
          />
          <div
            className={`absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 transition-colors ${
              effectiveLiveDocPresent ? 'border-emerald-400' : 'border-accent'
            }`}
          />
          <div
            className={`absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 transition-colors ${
              effectiveLiveDocPresent ? 'border-emerald-400' : 'border-accent'
            }`}
          />
        </div>
      )}

      {/* Dynamic Status Pill */}
      <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none z-20">
        <span className="text-xs bg-black/75 backdrop-blur-md px-4 py-2 rounded-full text-gray-200 border border-white/10 inline-flex items-center justify-center gap-2 font-arabic shadow-lg">
          {scanMode === 'idcard' ? (
            <span className="text-accent font-bold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              <span>{idCardStep === 'front' ? 'ضع الوجه الأمامي للهوية داخل الإطار' : 'ضع الوجه الخلفي للهوية'}</span>
            </span>
          ) : autoCapture && effectiveStabilityProgress > 0 ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>ثبّت الكاميرا... جاري الالتقاط التلقائي ({effectiveStabilityProgress}%)</span>
            </span>
          ) : effectiveLiveDocPresent ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>تم التعرف على المستند بنجاح</span>
            </span>
          ) : pagesCount > 0 ? (
            <span className="text-accent font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-accent" />
              <span>
                {pagesCount === 1
                  ? 'صفحة واحدة ممسوحة'
                  : pagesCount === 2
                  ? 'صفحتان ممسوحتان'
                  : `${pagesCount} صفحات مجمعة`}{' '}
                — التقط المزيد أو اضغط إنهاء
              </span>
            </span>
          ) : (
            <span className="text-gray-300">وجّه الكاميرا نحو المستند للتأطير والمسح</span>
          )}
        </span>
      </div>
    </div>

    {/* Mode Switcher Bar */}
    <div className="relative z-20 flex justify-center py-2.5 px-4 bg-gradient-to-t from-[#07090e] via-[#07090e]/90 to-transparent">
      <div className="flex items-center p-1 rounded-full bg-white/[0.08] border border-white/[0.1] shadow-lg">
        <button
          onClick={() => onSelectScanMode('batch')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'batch'
              ? 'bg-white text-black shadow-lg shadow-white/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>متعدد (دفعة)</span>
        </button>

        <button
          onClick={() => onSelectScanMode('single')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'single'
              ? 'bg-white text-black shadow-lg shadow-white/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          مفرد
        </button>

        <button
          onClick={() => onSelectScanMode('idcard')}
          className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            scanMode === 'idcard'
              ? 'bg-white text-black shadow-lg shadow-white/20'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>هوية</span>
        </button>
      </div>
    </div>

    {/* Bottom Shutter Dock */}
    <div
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 32px)',
      }}
      className="relative z-20 flex items-center justify-around px-8 pt-3 bg-gradient-to-t from-black via-black/80 to-transparent border-t border-white/[0.06]"
    >
      {/* Gallery Import */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 active:scale-90 transition-all cursor-pointer"
        title="استيراد من المعرض"
      >
        <ImageIcon className="w-5 h-5 text-gray-200" />
        <span className="text-[10px] text-gray-400 font-bold font-arabic">المعرض</span>
      </button>

      {/* Center: Tactile Shutter Button with Intelligent Stability Indicator */}
      <div className="relative flex items-center justify-center">
        {autoCapture && effectiveStabilityProgress > 0 && (
          <svg className="absolute -inset-2 w-24 h-24 -rotate-90 pointer-events-none z-10" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="rgba(16, 185, 129, 0.25)"
              strokeWidth="4"
              fill="none"
            />
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
            <div
              className={`w-14 h-14 rounded-full border border-black/10 flex items-center justify-center ${
                capturing ? 'scale-90 bg-gray-200' : ''
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-black/20" />
            </div>
          </div>
        </button>
      </div>

      {/* Right: Multi-Page Review & Finish Button */}
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

    {/* Hidden Gallery File Input */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={onFileChange}
      className="hidden"
    />
  </div>
);
