import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import {
  Cast,
  Radio,
  Smartphone,
  Tv,
  WifiOff,
  X
} from 'lucide-react';
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

  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'remote' | 'offline'>(() => {
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

  // Camera QR scanner state (scoped to open modal session)
  const [scanState, setScanState] = useState<{ open: boolean; active: boolean }>({
    open: isOpen,
    active: false
  });
  const isScanningCamera = isOpen && scanState.open && scanState.active;
  const setIsScanningCamera = useCallback((active: boolean) => {
    setScanState({ open: isOpen, active });
  }, [isOpen]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanAnimFrameRef = useRef<number | null>(null);

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

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsScanningCamera(false);
  }, [setIsScanningCamera]);

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

  // Camera QR Code Scanner Execution
  const startCameraScanner = async () => {
    setCameraError(null);
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      setCameraError(
        lang === 'ar'
          ? 'متصفح هذا الجهاز لا يدعم مسح QR. اكتب الرمز الظاهر على السبورة يدوياً.'
          : 'This browser cannot scan QR codes. Type the code shown on the board instead.'
      );
      setIsScanningCamera(false);
      return;
    }
    setIsScanningCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BarcodeDetectorApi = (window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;
      if (!BarcodeDetectorApi) {
        setCameraError(
          lang === 'ar'
            ? 'متصفح هذا الجهاز لا يدعم مسح QR. اكتب الرمز الظاهر على السبورة يدوياً.'
            : 'This browser cannot scan QR codes. Type the code shown on the board instead.'
        );
        setIsScanningCamera(false);
        return;
      }
      const detector = new BarcodeDetectorApi({ formats: ['qr_code'] });
      const scanLoop = async () => {
        if (!videoRef.current || !mediaStreamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue || '';
            const match =
              raw.match(/room=([A-Za-z0-9_-]+)/) ||
              raw.match(/(OTM-[A-Za-z0-9_-]+)/i) ||
              raw.match(/([0-9]{4,6})/);
            const detected = match ? match[1].toUpperCase() : raw.toUpperCase();
            if (detected) {
              stopCamera();
              setTargetRoomCode(detected);
              if (reader.doc) {
                void handleBeamDocument(detected);
              } else {
                handlePairAsRemote(detected);
              }
              return;
            }
          }
        } catch {}
        scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
      };
      scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err: unknown) {
      console.warn('Camera access error:', err);
      setCameraError(lang === 'ar' ? 'تعذر تشغيل الكاميرا، يمكنك كتابة الكود يدوياً' : 'Camera inaccessible, enter code manually');
      setIsScanningCamera(false);
    }
  };

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

  // Stop hardware stream cleanly without synchronous state update
  const stopHardwareCamera = useCallback(() => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopHardwareCamera();
    }
  }, [isOpen, stopHardwareCamera]);

  useEffect(() => {
    return () => {
      stopHardwareCamera();
    };
  }, [stopHardwareCamera]);

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

  const transferPhaseText = (() => {
    if (!transfer.active && transfer.phase !== 'finalizing') return null;
    const ar = lang === 'ar';
    if (transfer.phase === 'waiting-peer') {
      return ar ? 'بانتظار استجابة السبورة…' : 'Waiting for the receiver…';
    }
    if (transfer.phase === 'preparing') {
      return ar ? 'جارٍ تجهيز الاتصال المباشر…' : 'Preparing the direct connection…';
    }
    if (transfer.phase === 'finalizing') {
      return ar ? 'بانتظار فتح الملف على الجهاز الآخر…' : 'Waiting for the receiver to open the PDF…';
    }
    if (transfer.phase === 'transferring') {
      const channel = transfer.mode === 'p2p' ? (ar ? 'P2P مباشر' : 'Direct P2P') : ar ? 'سحابة' : 'Cloud';
      return `${channel} · ${transfer.progress}%`;
    }
    return null;
  })();

  const smartboardUrl = buildBeamLink(receiverRoomCode, 'sender');

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 select-none animate-in fade-in duration-200 theme-${reader.theme}`}
    >
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border-t sm:border border-line shadow-2xl flex flex-col text-ink animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Mobile Tactile Drag Indicator */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-line mx-auto mt-2.5 mb-0.5 opacity-60" />

        {/* Minimalist Header */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-3 border-b border-line bg-hover-subtle/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Cast className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-none">
                {lang === 'ar' ? 'البث الذكي للسبورة' : 'Smart Beam'}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.2 rounded-md font-bold">
                  xrtm8.github.io/Otium-Lab/
                </span>
                <span className="text-[10px] text-ink-muted">
                  {lang === 'ar' ? 'ربط فوري' : 'Zero-config'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Mode Selector Pills */}
        <div className="flex items-center p-1.5 mx-4 mt-3 bg-hover-subtle/70 rounded-2xl border border-line/60 gap-1 select-none">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('send');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'send'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'بث للسبورة' : 'Beam'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('receive');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'استقبال' : 'Receiver'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('offline');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'offline'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'بدون إنترنت' : 'Offline'}</span>
          </button>

          {beamState.role === 'sender' && connectedRoom && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveTab('remote');
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'remote'
                  ? 'bg-accent text-on-accent font-bold shadow-sm'
                  : 'text-accent hover:bg-hover'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'الريموت' : 'Remote'}</span>
            </button>
          )}
        </div>

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

        {/* Hidden File Input for Direct PDF Beaming */}
        <input
          ref={beamFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleBeamFileDirect}
        />

        {/* Hidden File Input for Offline / USB Flash Opening */}
        <input
          ref={offlineFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleOfflineFile}
        />

        {/* Hidden File Input for Receiver PC Direct Opening */}
        <input
          ref={receiverFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleReceiverFile}
        />
      </div>
    </div>
  );
};
