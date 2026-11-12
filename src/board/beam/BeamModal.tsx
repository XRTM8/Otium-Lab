import React from 'react';
import type { Language } from '../../core/i18n/translations';
import type { ThemeMode } from '../../core/types';
import type { ReaderController } from '../../app/useReaderController';
import { BeamReceiveTab, BeamSendTab } from './BeamSendReceiveTabs';
import { BeamOfflineTab, BeamRemoteTab } from './BeamOfflineRemoteTabs';
import { BeamHiddenFileInputs, BeamModalHeaderAndTabs } from './BeamModalChrome';
import { useBeamModalSession } from './useBeamModalSession';

interface BeamModalProps {
  isOpen: boolean;
  lang: Language;
  theme?: ThemeMode;
  reader: ReaderController;
  formFactor: 'desktop' | 'mobile';
  preferredRole?: 'receiver' | 'sender';
  isBoardOpen?: boolean;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}

export const BeamModal: React.FC<BeamModalProps> = ({
  isOpen,
  lang,
  reader,
  formFactor,
  preferredRole,
  onSetBoardOpen,
  onClose,
}) => {
  const s = useBeamModalSession({
    isOpen,
    lang,
    reader,
    formFactor,
    preferredRole,
    onSetBoardOpen,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 select-none animate-in fade-in duration-200 theme-${reader.theme}`}
    >
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border-t sm:border border-line shadow-2xl flex flex-col text-ink animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <BeamModalHeaderAndTabs
          lang={lang}
          activeTab={s.activeTab}
          showRemoteTab={Boolean(s.beamState.role === 'sender' && s.connectedRoom)}
          onSelectTab={(tab) => {
            s.stopCamera();
            s.setActiveTab(tab);
          }}
          onClose={onClose}
        />

        {s.activeTab === 'send' && (
          <BeamSendTab
            lang={lang}
            reader={reader}
            beamFileInputRef={s.beamFileInputRef}
            isScanningCamera={s.isScanningCamera}
            videoRef={s.videoRef}
            stopCamera={s.stopCamera}
            startCameraScanner={s.startCameraScanner}
            cameraError={s.cameraError}
            recentRooms={s.recentRooms}
            setTargetRoomCode={s.setTargetRoomCode}
            handleBeamDocument={s.handleBeamDocument}
            handlePairAsRemote={s.handlePairAsRemote}
            transfer={s.transfer}
            transferPhaseText={s.transferPhaseText}
            beamError={s.beamError}
            targetRoomCode={s.targetRoomCode}
            isSending={s.isSending}
            sendSuccess={s.sendSuccess}
          />
        )}

        {s.activeTab === 'receive' && (
          <BeamReceiveTab
            lang={lang}
            reader={reader}
            connectedRemotePeer={s.connectedRemotePeer}
            receiverRoomCode={s.receiverRoomCode}
            onSetBoardOpen={onSetBoardOpen}
            onClose={onClose}
            receiverFileInputRef={s.receiverFileInputRef}
            transfer={s.transfer}
            transferPhaseText={s.transferPhaseText}
            beamError={s.beamError}
            smartboardUrl={s.smartboardUrl}
            copiedCode={s.copiedCode}
            handleCopyCode={s.handleCopyCode}
            handleRegenerateCode={s.handleRegenerateCode}
            peerLeft={s.peerLeft}
            peer={s.peer}
            connStatus={s.connStatus}
          />
        )}

        {s.activeTab === 'offline' && (
          <BeamOfflineTab lang={lang} offlineFileInputRef={s.offlineFileInputRef} />
        )}

        {s.activeTab === 'remote' && (
          <BeamRemoteTab
            lang={lang}
            reader={reader}
            isReceiverAcknowledged={s.isReceiverAcknowledged}
            peerLeft={s.peerLeft}
            connectedRoom={s.connectedRoom}
            remoteDocTitle={s.remoteDocTitle}
            remoteTotal={s.remoteTotal}
            activePage={s.activePage}
            activeTotal={s.activeTotal}
            activeDocTitle={s.activeDocTitle}
            isSending={s.isSending}
            uploadProgress={s.uploadProgress}
            onDisconnectToSend={() => s.setActiveTab('send')}
            beamFileInputRef={s.beamFileInputRef}
            handleBeamDocument={s.handleBeamDocument}
            handleRemotePrev={s.handleRemotePrev}
            handleRemoteNext={s.handleRemoteNext}
          />
        )}

        <BeamHiddenFileInputs
          beamFileInputRef={s.beamFileInputRef}
          offlineFileInputRef={s.offlineFileInputRef}
          receiverFileInputRef={s.receiverFileInputRef}
          onBeamFileDirect={s.handleBeamFileDirect}
          onOfflineFile={s.openPickedFile}
          onReceiverFile={s.openPickedFile}
        />
      </div>
    </div>
  );
};
