import type React from 'react';
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import type { Language } from '../../core/i18n/translations';
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
  type BeamConnectionStatus,
} from './beamService';
import { defaultBeamTab } from './deviceRole';
import type { BeamModalTab } from './BeamModalChrome';
import { formatBeamTransferPhaseText } from './beamSessionFrames';
import { useBeamModalCamera } from './useBeamModalCamera';
import type { BeamMessage, BeamPeerState, BeamTransferState } from '../types';

export function useBeamModalSession({
  isOpen,
  lang,
  reader,
  formFactor,
  preferredRole,
  onSetBoardOpen,
  onClose,
}: {
  isOpen: boolean;
  lang: Language;
  reader: ReaderController;
  formFactor: 'desktop' | 'mobile';
  preferredRole?: 'receiver' | 'sender';
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}) {
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
    return defaultBeamTab(formFactor, Boolean(reader.doc), preferredRole);
  });
  const [targetRoomCode, setTargetRoomCode] = useState(() => initialLaunch.room || '');
  const [receiverRoomCode, setReceiverRoomCode] = useState(() => {
    const existing = beamService.getConnectedRoom();
    if (existing && beamService.getRole() === 'receiver') return existing;
    if (initialLaunch.role === 'receiver' && initialLaunch.room) return initialLaunch.room;
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
  const [connStatus, setConnStatus] = useState<BeamConnectionStatus>(() => beamService.getConnectionStatus());
  const [beamState, setBeamState] = useState<{ room: string | null; role: 'receiver' | 'sender' | null }>(() => ({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole(),
  }));
  const [peer, setPeer] = useState<BeamPeerState>(() => beamService.getPeerState());
  const [peerLeft, setPeerLeft] = useState(false);
  const [transfer, setTransfer] = useState<BeamTransferState>(() => beamService.getTransferState());

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
      setUploadProgress(state.active && state.direction === 'send' ? Math.round(state.progress) : null);
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

  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => setRecentRooms(getRecentRooms()));
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

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
    } catch (err) {
      console.warn('[BeamModal] Failed to parse launch URL:', err);
    }
    if (!launch.auto) return;
    launchAppliedRef.current = true;

    if (launch.room) setTargetRoomCode(launch.room);
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

  const defaultRoleRef = useRef({ open: false, formFactor, preferredRole });
  useEffect(() => {
    const previous = defaultRoleRef.current;
    defaultRoleRef.current = { open: isOpen, formFactor, preferredRole };
    if (!isOpen || (previous.open && previous.formFactor === formFactor && previous.preferredRole === preferredRole)) return;
    if (reader.beamPeerConnected || beamService.getConnectedRoom() || launchRef.current.role) return;
    setActiveTab(defaultBeamTab(formFactor, Boolean(reader.doc), preferredRole));
  }, [isOpen, formFactor, preferredRole, reader.doc, reader.beamPeerConnected]);

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

  useEffect(() => {
    if (!isOpen || activeTab !== 'receive') return;
    beamService.setLocalDocumentState(reader.docTitle || '', reader.currentPage || 1, reader.numPages || 0);
    beamService.startReceiver(receiverRoomCode);
  }, [isOpen, activeTab, receiverRoomCode, reader.docTitle, reader.currentPage, reader.numPages]);

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

  const handleBeamDocument = useCallback(async (overrideCode?: string) => {
    const code = formatRoomCode((overrideCode || targetRoomCode || beamService.getConnectedRoom() || '').trim());
    if (!code) {
      setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً.' : 'Please enter the board code first.');
      return;
    }
    if (!reader.doc || !reader.docId) {
      beamFileInputRef.current?.click();
      return;
    }
    setBeamError(null);
    beamService.startSender(code);
    reader.autoBeam.retry();
    setTargetRoomCode(code);
    setSendSuccess(true);
    setActiveTab('remote');
  }, [targetRoomCode, reader, lang]);

  const handlePairAsRemote = useCallback((overrideCode?: string) => {
    const code = formatRoomCode((overrideCode || targetRoomCode).trim());
    if (!code) {
      setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً.' : 'Please enter the board code first.');
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
    setTimeout(() => setActiveTab('remote'), 200);
  }, [targetRoomCode, reader.doc, handleBeamDocument, lang]);

  const handleBeamFileDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const code = formatRoomCode(targetRoomCode.trim() || connectedRoom || '');
      if (!code) {
        setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً' : 'Please enter room code first');
        return;
      }
      const opened = await reader.openFile(file);
      if (!opened) return;
      beamService.startSender(code);
      setTargetRoomCode(code);
      setActiveTab('remote');
    } catch {
      setBeamError(lang === 'ar' ? 'تعذر قراءة الملف المحدد' : 'Failed to read selected file');
    } finally {
      e.target.value = '';
    }
  };

  const camera = useBeamModalCamera({
    isOpen,
    lang,
    hasDoc: Boolean(reader.doc),
    readerDoc: reader.doc,
    onDetectedRoom: (detected, hasDoc) => {
      setTargetRoomCode(detected);
      if (hasDoc) void handleBeamDocument(detected);
      else handlePairAsRemote(detected);
    },
  });

  const openPickedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch (err) {
        console.debug('[BeamModal] Haptic vibrate ignored:', err);
      }
    }
  }, []);

  const activeDocTitle =
    reader.docTitle || remoteDocTitle || (lang === 'ar' ? 'المستند المتصل بالسبورة' : 'Connected Document');
  const activePage = reader.doc ? reader.currentPage : remotePage;
  const activeTotal = reader.doc ? reader.numPages : remoteTotal;

  const handleRemoteNext = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage >= activeTotal) return;
    triggerHaptic();
    const nextPage = activePage + 1;
    if (reader.doc) reader.goToNextPage();
    else setRemotePage(nextPage);
    beamService.broadcastPageChange(nextPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage <= 1) return;
    triggerHaptic();
    const prevPage = Math.max(1, activePage - 1);
    if (reader.doc) reader.goToPrevPage();
    else setRemotePage(prevPage);
    beamService.broadcastPageChange(prevPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

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

  return {
    activeTab, setActiveTab,
    targetRoomCode, setTargetRoomCode,
    receiverRoomCode,
    sendSuccess, copiedCode, recentRooms, beamError,
    remoteDocTitle, remoteTotal, uploadProgress, connStatus,
    beamState, peer, peerLeft, transfer,
    isSending, connectedRoom, connectedRemotePeer, isReceiverAcknowledged,
    offlineFileInputRef, beamFileInputRef, receiverFileInputRef,
    handleBeamDocument, handlePairAsRemote, handleBeamFileDirect,
    openPickedFile, handleRegenerateCode, handleCopyCode,
    handleRemoteNext, handleRemotePrev,
    activeDocTitle, activePage, activeTotal,
    transferPhaseText: formatBeamTransferPhaseText(transfer, lang),
    smartboardUrl: buildBeamLink(receiverRoomCode, 'sender'),
    ...camera,
  };
}
