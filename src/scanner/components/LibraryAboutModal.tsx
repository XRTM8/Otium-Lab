import React, { useState } from 'react';
import type { ThemeMode } from '../../core/types';
import type { Language } from '../../core/i18n/translations';
import { nativeOpenUrl, nativeInstallApk } from '../core/nativeBridge';
import type { UpdateCheckResult } from '../core/updater';
import {
  checkForAppUpdates,
  APP_CURRENT_VERSION,
  detectDeviceArchitecture,
} from '../core/updater';
import { OtiumLogo } from './OtiumLogo';
import {
  X,
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  ExternalLink,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface LibraryAboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  lang: Language;
  triggerHaptic: (duration?: number) => void;
}

export const LibraryAboutModal: React.FC<LibraryAboutModalProps> = ({
  isOpen,
  onClose,
  theme,
  lang,
  triggerHaptic,
}) => {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCheckUpdate = async () => {
    triggerHaptic(15);
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const res = await checkForAppUpdates();
      setUpdateResult(res);
      triggerHaptic(25);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setUpdateError(msg || 'تعذر الاتصال بـ GitHub للتحقق من التحديثات');
      triggerHaptic(40);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 fluid-fade">
      <div className="w-full max-w-sm max-h-[90vh] bg-[#0c1017]/95 border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden fluid-pop">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-white">{lang === 'ar' ? 'حول التطبيق والتحديثات' : 'About & Updates'}</span>
          </div>
          <button
            onClick={onClose}
            className="fluid-press p-1.5 rounded-full glass-button text-gray-400 active:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-center">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-teal-500/5 border border-accent/30 flex items-center justify-center shadow-lg mb-3">
              <OtiumLogo size={34} theme={theme} />
            </div>
            <h3 className="text-lg font-black tracking-wide text-white">Otium</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {lang === 'ar' ? 'الماسح الضوئي الذكي • بيئة عمل أوتيوم المتكاملة' : 'Companion Scanner • Otium Ecosystem'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
                v{APP_CURRENT_VERSION}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-400 border border-white/[0.08]">
                {detectDeviceArchitecture()}
              </span>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-right">
            {!updateResult && !isCheckingUpdate && !updateError && (
              <div className="text-center space-y-3">
                <p className="text-xs text-gray-300 leading-relaxed">
                  {lang === 'ar' ? 'احتراماً لخصوصيتك المطلقة، لا يتصل التطبيق بالإنترنت في الخلفية نهائياً. يتم فحص الإصدارات فقط عند طلبك.' : 'Complete privacy: Otium never phones home or checks the network in the background. Updates are checked strictly upon user request.'}
                </p>
                <button
                  onClick={handleCheckUpdate}
                  className="fluid-press w-full py-2.5 px-4 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-accent/20 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'التحقق من وجود تحديثات' : 'Check for Updates'}</span>
                </button>
              </div>
            )}

            {isCheckingUpdate && (
              <div className="text-center py-4 space-y-2">
                <RefreshCw className="w-6 h-6 text-accent animate-spin mx-auto" />
                <p className="text-xs text-gray-300">جاري الاتصال بـ GitHub Releases...</p>
              </div>
            )}

            {updateError && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{updateError}</span>
                </div>
                <button
                  onClick={() => nativeOpenUrl('https://github.com/XRTM8/Otium-Lab/releases/latest')}
                  className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-accent/20 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'تنزيل التحديث مباشرة عبر المتصفح' : 'Download via Browser'}</span>
                </button>
                <button
                  onClick={handleCheckUpdate}
                  className="fluid-press w-full py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/[0.1] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                </button>
              </div>
            )}

            {updateResult && updateResult.hasUpdate && (
              <div className="space-y-3 text-right">
                <div className="flex items-center gap-2 text-accent font-bold text-xs bg-accent/15 p-2.5 rounded-xl border border-accent/30">
                  <Sparkles className="w-4 h-4 shrink-0 text-accent animate-pulse" />
                  <span>{lang === 'ar' ? `يتوفر إصدار جديد: v${updateResult.latestVersion}` : `New update available: v${updateResult.latestVersion}`}</span>
                </div>

                {updateResult.releaseNotes && (
                  <div className="text-[11px] text-gray-300 bg-black/40 p-2.5 rounded-xl max-h-32 overflow-y-auto whitespace-pre-wrap font-sans border border-white/[0.05] leading-relaxed">
                    {updateResult.releaseNotes}
                  </div>
                )}

                {updateResult.matchedAsset ? (
                  <button
                    onClick={() => {
                      nativeInstallApk(
                        updateResult.matchedAsset!.downloadUrl,
                        updateResult.matchedAsset!.name
                      );
                    }}
                    className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-accent/20 font-arabic cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'ar' ? `تنزيل وتثبيت التحديث مباشرة (${updateResult.matchedAsset.name.includes('arm64') ? 'arm64' : 'APK'} • ${(updateResult.matchedAsset.size / (1024 * 1024)).toFixed(1)} MB)` : `Download & Install Update (${(updateResult.matchedAsset.size / (1024 * 1024)).toFixed(1)} MB)`}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                    className="fluid-press w-full py-2.5 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'فتح صفحة الإصدار على GitHub' : 'Open Release on GitHub'}</span>
                  </button>
                )}

                <button
                  onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                  className="w-full text-center text-[10px] text-gray-400 hover:text-emerald-400 flex items-center justify-center gap-1 py-1"
                >
                  <span>عرض تفاصيل الإصدار بالكامل على GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}

            {updateResult && !updateResult.hasUpdate && (
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>أنت على أحدث إصدار (v{updateResult.currentVersion})</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  تطبيقك محدث بالكامل ويمتلك كافة مزايا الاستقرار والأداء العالي.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCheckUpdate}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>فحص مجدداً</span>
                  </button>
                  <button
                    onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>سجل الإصدارات</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-gray-400 space-y-1.5 pt-1 border-t border-white/[0.06]">
            <p className="font-semibold text-gray-300">مبادئ أو تيوم (Otium Principles)</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              خصوصية 100% دون خوادم وسيطة • دون تتبع أو إعلانات • مفتوح المصدر ومصمم ليدوم لسنوات باستقرار تام.
            </p>
          </div>

          <button
            onClick={() => nativeOpenUrl('https://github.com/XRTM8/Otium-Lab')}
            className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 text-[11px] font-medium flex items-center justify-center gap-2 border border-white/[0.08] transition-colors"
          >
            <span>مستودع المشروع على GitHub</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
