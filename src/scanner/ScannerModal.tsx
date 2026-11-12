import React from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { LibraryModal } from './components/LibraryModal';
import { SettingsModal } from '../components/SettingsModal';
import { clearScanSession, clearActiveSessionPages } from './core/storage/pageStore';
import { AlertTriangle, Bookmark, Trash2 } from 'lucide-react';
import { OtiumLogo } from '../components/OtiumLogo';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { useScannerSession } from './useScannerSession';

interface ScannerModalProps {
  isOpen: boolean;
  theme?: ThemeMode;
  lang?: Language;
  onClose: () => void;
  onPdfGenerated: (file: File) => void;
}

function formatArabicPagesCount(count: number): string {
  if (count === 1) return 'صفحة واحدة';
  if (count === 2) return 'صفحتان ممسوحتان';
  if (count >= 3 && count <= 10) return `${count} صفحات ممسوحة`;
  return `${count} صفحة ممسوحة`;
}

export const ScannerModal: React.FC<ScannerModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <ScannerModalContent {...props} />;
};

const ScannerModalContent: React.FC<Omit<ScannerModalProps, 'isOpen'>> = ({
  theme = 'midnight',
  lang = 'ar',
  onClose,
  onPdfGenerated,
}) => {
  const s = useScannerSession(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'ar' ? 'ماسح المستندات الضوئي' : 'Document Scanner'}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 bg-[#07090e] text-white flex flex-col select-none overflow-hidden animate-in fade-in zoom-in-[0.985] duration-250 ease-out theme-${theme}`}
    >
      {s.step === 'camera' && (
        <CameraView
          onCapture={s.handleCapture}
          pagesCount={s.pages.length}
          lastThumbnail={s.pages[s.pages.length - 1]?.thumbnailDataUrl}
          onFinishBatch={() => s.setStep('review')}
          onOpenLibrary={() => s.setIsLibraryOpen(true)}
          onOpenSettings={() => s.setIsSettingsOpen(true)}
          onClose={s.handleRequestClose}
        />
      )}

      {s.step === 'crop' && (
        <CropView
          imageSrc={s.currentRawImage}
          initialQuad={s.currentInitialQuad ?? undefined}
          onConfirm={s.handleCropConfirm}
          onCancel={s.handleCropCancel}
        />
      )}

      {s.step === 'review' && (
        <EnhanceView
          pages={s.pages}
          onBackToCamera={() => s.setStep('camera')}
          onAddMorePages={s.handleAddMorePages}
          onDeletePage={s.handleDeletePage}
          onMovePage={s.handleMovePage}
          onRetakePage={s.handleRetakePage}
          onRotatePage={s.handleRotatePage}
          onDuplicatePage={s.handleDuplicatePage}
          onUpdatePageThumbnail={s.handleUpdatePageThumbnail}
          onEditCrop={s.handleEditCrop}
          onResetAll={s.handleResetAll}
          onOpenPdfInReader={(file) => {
            s.setIsOpeningInReader(true);
            window.setTimeout(() => {
              clearScanSession();
              clearActiveSessionPages();
              s.setPages([]);
              onPdfGenerated(file);
              window.setTimeout(() => onClose(), 260);
            }, 180);
          }}
        />
      )}

      {s.isLibraryOpen && (
        <LibraryModal
          isOpen={s.isLibraryOpen}
          onClose={() => s.setIsLibraryOpen(false)}
          theme={theme}
          lang={lang}
          onOpenSettings={() => {
            s.setIsLibraryOpen(false);
            s.setIsSettingsOpen(true);
          }}
          onOpenDocument={(doc) => {
            s.setIsLibraryOpen(false);
            clearScanSession();
            clearActiveSessionPages();
            s.setPages([]);
            const file = new File([doc.pdfBlob], `${doc.title}.pdf`, { type: 'application/pdf' });
            onPdfGenerated(file);
            onClose();
          }}
        />
      )}

      {s.isSettingsOpen && (
        <SettingsModal
          isOpen={s.isSettingsOpen}
          onClose={() => s.setIsSettingsOpen(false)}
          lang={lang}
          initialTab="scanner"
        />
      )}

      {s.showCloseConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none fluid-fade" dir="rtl">
          <div className="bg-[#12151d] border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl fluid-pop">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-arabic">إغلاق جلسة المسح الضوئي؟</h3>
              <p className="text-xs text-gray-400 leading-relaxed font-arabic">
                لديك <span className="text-accent font-bold">{lang === 'ar' ? formatArabicPagesCount(s.pages.length) : `${s.pages.length} pages`}</span>. هل تود حفظها كمسودة للمتابعة لاحقاً أم حذفها؟
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={s.handleSaveDraftAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-on-accent font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-accent/20 active:scale-95"
              >
                <Bookmark className="w-4 h-4 fill-current" />
                <span>حفظ كمسودة ومغادرة</span>
              </button>

              <button
                onClick={s.handleDiscardAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-bold text-xs flex items-center justify-center gap-2 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الصفحات ومغادرة</span>
              </button>

              <button
                onClick={() => s.setShowCloseConfirmModal(false)}
                className="w-full py-2.5 px-4 rounded-xl glass-button text-gray-400 hover:text-white font-bold text-xs transition-all cursor-pointer active:scale-95"
              >
                متابعة المسح
              </button>
            </div>
          </div>
        </div>
      )}

      {s.isOpeningInReader && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200 select-none">
          <div className="relative w-16 h-16 rounded-3xl bg-accent/20 border border-accent/40 flex items-center justify-center shadow-2xl">
            <div className="absolute inset-0 rounded-3xl border border-accent animate-ping opacity-30" />
            <OtiumLogo size={32} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-bold text-white font-arabic">
              {lang === 'ar' ? 'جاري فتح المستند في القارئ...' : 'Opening in Reader...'}
            </p>
            <p className={`text-xs text-gray-400 ${lang === 'ar' ? 'font-arabic' : 'font-mono'}`}>
              {lang === 'ar' ? formatArabicPagesCount(s.pages.length) : `${s.pages.length} ${s.pages.length === 1 ? 'page' : 'pages'} scanned`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
