import React from 'react';
import { Download, Printer, Send, Trash2 } from 'lucide-react';
import type { ScannedPage } from '../core/types';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { SignatureModal } from './SignatureModal';

export interface EnhanceConfirmationModalsProps {
  pages: ScannedPage[];
  safeIndex: number;
  currentPage: ScannedPage;
  showCancelModal: boolean;
  setShowCancelModal: (open: boolean) => void;
  showDeletePageModal: boolean;
  setShowDeletePageModal: (open: boolean) => void;
  showMoreActions: boolean;
  setShowMoreActions: (open: boolean) => void;
  isSignatureOpen: boolean;
  setIsSignatureOpen: (open: boolean) => void;
  setToastMsg: (msg: string) => void;
  setCurrentPageIndex: (idx: number) => void;
  setSignatures: React.Dispatch<React.SetStateAction<Record<string, SignaturePlacement>>>;
  onDeletePage: (index: number) => void;
  onResetAll: () => void;
  onShareWhatsApp: () => void;
  onDownloadPdf: () => void;
  onPrintPdf: () => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceConfirmationModals: React.FC<EnhanceConfirmationModalsProps> = ({
  pages,
  safeIndex,
  currentPage,
  showCancelModal,
  setShowCancelModal,
  showDeletePageModal,
  setShowDeletePageModal,
  showMoreActions,
  setShowMoreActions,
  isSignatureOpen,
  setIsSignatureOpen,
  setToastMsg,
  setCurrentPageIndex,
  setSignatures,
  onDeletePage,
  onResetAll,
  onShareWhatsApp,
  onDownloadPdf,
  onPrintPdf,
  triggerHaptic,
}) => (
  <>
    {showCancelModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-arabic">حذف كافة الصور والعودة للرئيسية؟</h3>
            <p className="text-xs text-gray-400 leading-relaxed font-arabic">
              سيتم إلغاء جلسة المسح الحالية وإفراغ كافة الصفحات الملتقطة والرجوع لشاشة الكاميرا.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 font-arabic">
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowCancelModal(false);
                onResetAll();
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
            >
              نعم، حذف الكل
            </button>
            <button
              onClick={() => setShowCancelModal(false)}
              className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
            >
              تراجع
            </button>
          </div>
        </div>
      </div>
    )}

    {showDeletePageModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-arabic">حذف هذه الصفحة؟</h3>
            <p className="text-xs text-gray-400 leading-relaxed font-arabic">
              {pages.length <= 1
                ? 'هذه هي الصفحة الوحيدة في الجلسة. حذفها سيعيدك إلى شاشة الكاميرا.'
                : `سيتم حذف الصفحة رقم ${safeIndex + 1} من المستند.`}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 font-arabic">
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowDeletePageModal(false);
                if (pages.length <= 1) {
                  onResetAll();
                } else {
                  onDeletePage(safeIndex);
                  if (safeIndex > 0) setCurrentPageIndex(safeIndex - 1);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
            >
              نعم، حذف الصفحة
            </button>
            <button
              onClick={() => setShowDeletePageModal(false)}
              className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
            >
              تراجع
            </button>
          </div>
        </div>
      </div>
    )}

    {showMoreActions && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-in fade-in"
        onClick={() => setShowMoreActions(false)}
      >
        <div
          className="bg-[#12151d] border-t border-white/15 rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom-5 font-arabic"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white text-center pb-2 border-b border-white/10">
            خيارات التصدير والمشاركة
          </h3>

          <button
            onClick={() => {
              setShowMoreActions(false);
              onShareWhatsApp();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
          >
            <Send className="w-4 h-4 text-accent shrink-0" />
            <span>إرسال سريع عبر الواتساب والمحادثات (&lt; 1.5MB)</span>
          </button>

          <button
            onClick={() => {
              setShowMoreActions(false);
              onDownloadPdf();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
          >
            <Download className="w-4 h-4 text-accent shrink-0" />
            <span>تنزيل وحفظ ملف PDF في الجهاز</span>
          </button>

          <button
            onClick={() => {
              setShowMoreActions(false);
              onPrintPdf();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
          >
            <Printer className="w-4 h-4 text-accent shrink-0" />
            <span>طباعة المستند عبر طابعة</span>
          </button>

          <button
            onClick={() => setShowMoreActions(false)}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-semibold text-xs mt-2"
          >
            إغلاق
          </button>
        </div>
      </div>
    )}

    <SignatureModal
      isOpen={isSignatureOpen}
      onClose={() => setIsSignatureOpen(false)}
      onSaveSignature={(sigUrl) => {
        if (!currentPage) return;
        triggerHaptic(20);
        setSignatures((prev) => ({
          ...prev,
          [currentPage.id]: { dataUrl: sigUrl, x: 0.58, y: 0.72 },
        }));
        setToastMsg('Signature placed on current page');
        setTimeout(() => setToastMsg(''), 2200);
      }}
    />
  </>
);
