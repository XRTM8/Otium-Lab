import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import type { Language } from '../../core/i18n/translations';
import type { ThemeMode } from '../../core/types';
import type { ReaderController } from '../../app/useReaderController';
import {
  beamService,
  buildBeamLink,
  formatRoomCode,
  generateNewReceiverRoomCode,
  getPersistentReceiverRoomCode,
  getRecentRooms,
  parseBeamLaunch,
  saveRecentRoom,
  type BeamConnectionStatus
} from './beamService';
import { defaultBeamTab } from './deviceRole';
import { BeamReceiveTab, BeamSendTab } from './BeamSendReceiveTabs';
import { BeamOfflineTab, BeamRemoteTab } from './BeamOfflineRemoteTabs';
import {
  BeamHiddenFileInputs,
  BeamModalHeaderAndTabs,
  type BeamModalTab,
} from './BeamModalChrome';
import { formatBeamTransferPhaseText } from './beamSessionFrames';
import { useBeamModalCamera } from './useBeamModalCamera';
import type {
  BeamMessage,
  BeamPeerState,
  BeamTransferState
} from '../types';

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
  onClose
}) => {
  const [initialLaunch] = useState(() =>
    parseBeamLaunch(
      typeof window !== 'undefined' ? window.location.hash : '',
      typeof window !== 'undefined' ? window.location.search : ''
    )
  );
  const launchRef = useRef(initialLaunch);

  const [activeTab, setActiveTab] = useState<BeamModalTab>(() => {
    const role = beamService.getRole();
    if (role === 'receiver') return 'receive';
    if (role === 'sender') return beamService.getConnectedRoom() ? 'remote' : 'send';
    if (initialLaunch.role === 'receiver') return 'receive';
    if (initialLaunch.role === 'sender') return 'send';
    // A large screen with no document is almost always the receiving board.
    // Never infer this from window.innerWidth: a narrow desktop window used to
    // become a sender and silently stopped listening for the phone.
    return defaultBeamTab(formFactor, Boolean(reader.doc), preferredRole);
  });
  const [targetRoomCode, setTargetRoomCode] = useState(() => initialLaunch.room || '');
  const [receiverRoomCode, setReceiverRoomCode] = useState(() => {
    const existing = beamService.getConnectedRoom();
    if (existing && beamService.getRole() === 'receiver') {
      return existing;
    }
    if (initialLaunch.role === 'receiver' && initialLaunch.room) {
      return initialLaunch.room;
    }
    return getPersistentReceiverRoomCode();
  });
  const launchAppliedRef = useRef(false);
  const receiverRoomRef = useRef(receiverRoomCode);
  useLayoutEffect(() => {
    receiverRoomRef.current = receiverRoomCode;
  }, [receiverRoomCode]);

  const [sendSuccess, setSendSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>(() => getRecentRooms());
  const [beamError, setBeamError] = useState<string | null>(null);
  const [remoteDocTitle, setRemoteDocTitle] = useState<string>(() => reader.docTitle || '');
  const [remotePage, setRemotePage] = useState<number>(() => reader.currentPage || 1);
  const [remoteTotal, setRemoteTotal] = useState<number>(() => reader.numPages || 0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<BeamConnectionStatus>(() =>
    beamService.getConnectionStatus()
  );
  const [beamState, setBeamState] = useState<{
    room: string | null;
    role: 'receiver' | 'sender' | null;
  }>(() => ({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole()
  }));
  const [peer, setPeer] = useState<BeamPeerState>(() => beamService.getPeerState());
  const [peerLeft, setPeerLeft] = useState(false);
  const [transfer, setTransfer] = useState<BeamTransferState>(() =>
    beamService.getTransferState()
  );

  const isSending = transfer.active && transfer.direction === 'send';
  const connectedRoom = beamState.room;
  const connectedRemotePeer =
    beamState.role === 'receiver' && peer.connected
      ? peer.peerName || (lang === 'ar' ? 'الهاتف' : 'Remote')
      : null;
  const isReceiverAcknowledged = beamState.role === 'sender' && peer.connected;
  const offlineFileInputRef = useRef<HTMLInputElement>(null);
  const beamFileInputRef = useRef<HTMLInputElement>(null);
  const receiverFileInputRef = useRef<HTMLInputElement>(null);

  // Sync beam connection, peer and transfer state.
  useEffect(() => {
    let hadPeer = beamService.getPeerState().connected;
    const unsubState = beamService.onStateChange((state) => {
      setBeamState(state);
      if (!state.role) setSendSuccess(false);
    });
    const unsubStatus = beamService.onConnectionStatusChange((status) => {
      setConnStatus(status);
    });
    const unsubPeer = beamService.onPeerChange((state) => {
      if (hadPeer && !state.connected) {
        setPeerLeft(true);
        setRemoteDocTitle('');
        setRemoteTotal(0);
      }
      if (state.connected) setPeerLeft(false);
      hadPeer = state.connected;
      setPeer(state);
      if (state.docTitle) setRemoteDocTitle(state.docTitle);
      if (typeof state.pageNumber === 'number') setRemotePage(state.pageNumber);
      if (typeof state.totalPages === 'number') setRemoteTotal(state.totalPages);
    });
    const unsubTransfer = beamService.onTransferProgress((state) => {
      setTransfer(state);
      if (state.active && state.direction === 'send') {
        setUploadProgress(Math.round(state.progress));
      } else {
        setUploadProgress(null);
      }
      if (state.phase === 'error' && state.error) {
        setBeamError(state.error);
      }
    });
    return () => {
      unsubState();
      unsubStatus();
      unsubPeer();
      unsubTransfer();
    };
  }, []);

  // Refresh recent rooms after opening without blocking mount render
  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      setRecentRooms(getRecentRooms());
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  // Read the role from the link. `role=receive` is the important one: a PC that
  // opens a board link must start listening immediately, not open the send tab.
  useEffect(() => {
    if (!isOpen) {
      launchAppliedRef.current = false;
      return;
    }
    if (launchAppliedRef.current) return;

    let launch = launchRef.current;
    try {
      if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
        launch = parseBeamLaunch(window.location.hash, window.location.search);
      }
    } catch {}
    if (!launch.auto) return;
    launchAppliedRef.current = true;

    if (launch.room) {
      setTargetRoomCode(launch.room);
    }

    if (launch.role === 'receiver') {
      const room = launch.room || receiverRoomRef.current;
      setReceiverRoomCode(room);
      setActiveTab('receive');
      beamService.startReceiver(room);
      return;
    }

    if (launch.role === 'sender') {
      setActiveTab('send');
      return;
    }

    if (!reader.doc && formFactor === 'desktop' && launch.room) {
      setReceiverRoomCode(launch.room);
      setActiveTab('receive');
      beamService.startReceiver(launch.room);
    }
  }, [isOpen, formFactor, reader.doc]);

  // Device role is a default for a new session, never a reason to replace a
  // connected peer. Re-evaluate on opening because settings can change while
  // this modal stays mounted and hidden.
  const defaultRoleRef = useRef({ open: false, formFactor, preferredRole });
  useEffect(() => {
    const previous = defaultRoleRef.current;
    defaultRoleRef.current = { open: isOpen, formFactor, preferredRole };
    if (!isOpen || (previous.open && previous.formFactor === formFactor && previous.preferredRole === preferredRole)) return;
    if (reader.beamPeerConnected || beamService.getConnectedRoom() || launchRef.current.role) return;
    setActiveTab(defaultBeamTab(formFactor, Boolean(reader.doc), preferredRole));
  }, [isOpen, formFactor, preferredRole, reader.doc, reader.beamPeerConnected]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Join the cloud room whenever the Receiver tab is active. The service is
  // idempotent, so page changes and re-renders cannot tear down signaling.
  useEffect(() => {
    if (!isOpen || activeTab !== 'receive') return;
    beamService.setLocalDocumentState(
      reader.docTitle || '',
      reader.currentPage || 1,
      reader.numPages || 0
    );
    beamService.startReceiver(receiverRoomCode);
  }, [
    isOpen,
    activeTab,
    receiverRoomCode,
    reader.docTitle,
    reader.currentPage,
    reader.numPages
  ]);

  // Close the modal as soon as the receiver gets a document. The reader
  // controller performs the actual load.
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = beamService.subscribe((msg: BeamMessage) => {
      if (
        msg.type === 'BEAM_DOCUMENT_OPENED' &&
        msg.payload &&
        beamService.getRole() === 'receiver' &&
        beamService.isMatchingRoom(msg.roomCode, receiverRoomRef.current)
      ) {
        saveRecentRoom(receiverRoomRef.current);
        onSetBoardOpen(false);
        onClose();
      }
    });
    return () => unsubscribe();
  }, [isOpen, onSetBoardOpen, onClose]);

  // All file transfers are owned by the reader, including when this modal
  // is closed. Pairing and manual Retry share that same queue.
  const handleBeamDocument = useCallback(async (overrideCode?: string) => {
    const code = formatRoomCode((overrideCode || targetRoomCode || beamService.getConnectedRoom() || '').trim());
    if (!code) { setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً.' : 'Please enter the board code first.'); return; }
    if (!reader.doc || !reader.docId) { beamFileInputRef.current?.click(); return; }
    setBeamError(null);
    beamService.startSender(code);
    reader.autoBeam.retry();
    setTargetRoomCode(code); setSendSuccess(true); setActiveTab('remote');
  }, [targetRoomCode, reader, lang]);

  // Quick remote pairing. The service retries the handshake continuously, so
  // there is no 8-attempt limit and no need for duplicate QUERY messages.
  const handlePairAsRemote = useCallback(
    (overrideCode?: string) => {
      const raw = (overrideCode || targetRoomCode).trim();
      const code = formatRoomCode(raw);
      if (!code) {
        setBeamError(
          lang === 'ar'
            ? 'يرجى إدخال رمز السبورة أولاً.'
            : 'Please enter the board code first.'
        );
        return;
      }

      setBeamError(null);

      if (reader.doc) {
        void handleBeamDocument(code);
        return;
      }

      beamService.startSender(code);
      setTargetRoomCode(code);
      setSendSuccess(true);
      setTimeout(() => {
        setActiveTab('remote');
      }, 200);
    },
    [targetRoomCode, reader.doc, handleBeamDocument, lang]
  );

  // File picker handler to beam a file directly without opening it first
  const handleBeamFileDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const code = formatRoomCode(targetRoomCode.trim() || connectedRoom || '');
      if (!code) { setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً' : 'Please enter room code first'); return; }
      const opened = await reader.openFile(file);
      if (!opened) return;
      beamService.startSender(code);
      setTargetRoomCode(code); setActiveTab('remote');
    } catch {
      setBeamError(lang === 'ar' ? 'تعذر قراءة الملف المحدد' : 'Failed to read selected file');
    } finally {
      e.target.value = '';
    }
  };

  const { isScanningCamera, cameraError, videoRef, stopCamera, startCameraScanner } =
    useBeamModalCamera({
      isOpen,
      lang,
      hasDoc: Boolean(reader.doc),
      readerDoc: reader.doc,
      onDetectedRoom: (detected, hasDoc) => {
        setTargetRoomCode(detected);
        if (hasDoc) {
          void handleBeamDocument(detected);
        } else {
          handlePairAsRemote(detected);
        }
      },
    });

  const handleOfflineFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void reader.openFile(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  const handleReceiverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // The reader controller announces the document/page after it has loaded.
      // Announcing immediately here used to send page 1 with the old document.
      void reader.openFile(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  const handleRegenerateCode = () => {
    beamService.disconnect();
    const newCode = generateNewReceiverRoomCode();
    setReceiverRoomCode(newCode);
    setBeamError(null);
    beamService.startReceiver(newCode);
  };

  // Tactile Haptic Feedback Pulse
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch {}
    }
  }, []);

  const activeDocTitle =
    reader.docTitle || remoteDocTitle || (lang === 'ar' ? 'المستند المتصل بالسبورة' : 'Connected Document');
  const activePage = reader.doc ? reader.currentPage : remotePage;
  const activeTotal = reader.doc ? reader.numPages : remoteTotal;

  // Remote clicker controls. Send exactly one absolute page command: the old
  // code sent BEAM_STEP + BEAM_PAGE_CHANGE, which double-advanced the receiver.
  const handleRemoteNext = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage >= activeTotal) return;
    triggerHaptic();
    const nextPage = activePage + 1;
    if (reader.doc) {
      reader.goToNextPage();
    } else {
      setRemotePage(nextPage);
    }
    beamService.broadcastPageChange(nextPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage <= 1) return;
    triggerHaptic();
    const prevPage = Math.max(1, activePage - 1);
    if (reader.doc) {
      reader.goToPrevPage();
    } else {
      setRemotePage(prevPage);
    }
    beamService.broadcastPageChange(prevPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

  // Keyboard navigation when remote tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'remote') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleRemoteNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handleRemotePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, handleRemoteNext, handleRemotePrev]);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(receiverRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const transferPhaseText = formatBeamTransferPhaseText(transfer, lang);

  const smartboardUrl = buildBeamLink(receiverRoomCode, 'sender');

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 select-none animate-in fade-in duration-200 theme-${reader.theme}`}
    >
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border-t sm:border border-line shadow-2xl flex flex-col text-ink animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <BeamModalHeaderAndTabs
          lang={lang}
          activeTab={activeTab}
          showRemoteTab={Boolean(beamState.role === 'sender' && connectedRoom)}
          onSelectTab={(tab) => {
            stopCamera();
            setActiveTab(tab);
          }}
          onClose={onClose}
        />

        {/* Tab 1: Send Mode (From Phone / Laptop) */}
        {activeTab === 'send' && (
          <BeamSendTab
            lang={lang}
            reader={reader}
            beamFileInputRef={beamFileInputRef}
            isScanningCamera={isScanningCamera}
            videoRef={videoRef}
            stopCamera={stopCamera}
            startCameraScanner={startCameraScanner}
            cameraError={cameraError}
            recentRooms={recentRooms}
            setTargetRoomCode={setTargetRoomCode}
            handleBeamDocument={handleBeamDocument}
            handlePairAsRemote={handlePairAsRemote}
            transfer={transfer}
            transferPhaseText={transferPhaseText}
            beamError={beamError}
            targetRoomCode={targetRoomCode}
            isSending={isSending}
            sendSuccess={sendSuccess}
          />
        )}

        {/* Tab 2: Receiver Screen Mode (Smartboard Display) */}
        {activeTab === 'receive' && (
          <BeamReceiveTab
            lang={lang}
            reader={reader}
            connectedRemotePeer={connectedRemotePeer}
            receiverRoomCode={receiverRoomCode}
            onSetBoardOpen={onSetBoardOpen}
            onClose={onClose}
            receiverFileInputRef={receiverFileInputRef}
            transfer={transfer}
            transferPhaseText={transferPhaseText}
            beamError={beamError}
            smartboardUrl={smartboardUrl}
            copiedCode={copiedCode}
            handleCopyCode={handleCopyCode}
            handleRegenerateCode={handleRegenerateCode}
            peerLeft={peerLeft}
            peer={peer}
            connStatus={connStatus}
          />
        )}

        {/* Tab 3: Offline Mode (No Internet in Classroom) */}
        {activeTab === 'offline' && (
          <BeamOfflineTab lang={lang} offlineFileInputRef={offlineFileInputRef} />
        )}

        {/* Tab 4: Presentation Remote Clicker */}
        {activeTab === 'remote' && (
          <BeamRemoteTab
            lang={lang}
            reader={reader}
            isReceiverAcknowledged={isReceiverAcknowledged}
            peerLeft={peerLeft}
            connectedRoom={connectedRoom}
            remoteDocTitle={remoteDocTitle}
            remoteTotal={remoteTotal}
            activePage={activePage}
            activeTotal={activeTotal}
            activeDocTitle={activeDocTitle}
            isSending={isSending}
            uploadProgress={uploadProgress}
            onDisconnectToSend={() => setActiveTab('send')}
            beamFileInputRef={beamFileInputRef}
            handleBeamDocument={handleBeamDocument}
            handleRemotePrev={handleRemotePrev}
            handleRemoteNext={handleRemoteNext}
          />
        )}

        <BeamHiddenFileInputs
          beamFileInputRef={beamFileInputRef}
          offlineFileInputRef={offlineFileInputRef}
          receiverFileInputRef={receiverFileInputRef}
          onBeamFileDirect={handleBeamFileDirect}
          onOfflineFile={handleOfflineFile}
          onReceiverFile={handleReceiverFile}
        />
      </div>
    </div>
  );
};
