// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraCapture } from './useCameraCapture';

describe('useCameraCapture', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mountCamera() {
    const ref: { current: ReturnType<typeof useCameraCapture> | null } = { current: null };
    const setTorchOn = vi.fn();
    function Harness() {
      const fileInputRef = useRef<HTMLInputElement | null>(null);
      const hook = useCameraCapture({
        cropMode: 'auto',
        viewfinderFit: 'cover',
        autoCapture: false,
        facingMode: 'environment',
        scanMode: 'batch',
        idCardStep: 'front',
        setIdCardStep: vi.fn(),
        idFrontDataUrl: null,
        setIdFrontDataUrl: vi.fn(),
        setIdStatusToast: vi.fn(),
        setCaptureToast: vi.fn(),
        setTorchOn,
        pagesCount: 0,
        triggerHaptic: vi.fn(),
        fileInputRef,
        onCapture: vi.fn(),
      });
      useEffect(() => {
        ref.current = hook;
      });
      return <video />;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    return ref;
  }

  it('marks permission denied gracefully when camera mediaDevices API is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const ref = await mountCamera();
    expect(ref.current?.hasPermission).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('stops after a permission denial and recovers on a user retry', async () => {
    const retry = Promise.withResolvers<MediaStream>();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as Partial<MediaStream> as MediaStream;
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
      .mockReturnValueOnce(retry.promise);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const ref = await mountCamera();
    expect(ref.current).toMatchObject({ hasPermission: false, stream: null, capturing: false });
    expect(getUserMedia).toHaveBeenCalledOnce();
    let request: Promise<void> | undefined;
    await act(async () => { request = ref.current?.initCamera(); });
    expect(ref.current?.hasPermission).toBeNull();
    await act(async () => {
      retry.resolve(stream);
      await request;
    });
    expect(ref.current).toMatchObject({ hasPermission: true, stream });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the stream returned by an older request after a newer retry succeeds', async () => {
    const initial = Promise.withResolvers<MediaStream>();
    const stopOld = vi.fn();
    const oldStream = { getTracks: () => [{ stop: stopOld }] } as Partial<MediaStream> as MediaStream;
    const newStream = { getTracks: () => [] } as Partial<MediaStream> as MediaStream;
    const getUserMedia = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValueOnce(newStream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const ref = await mountCamera();
    await act(async () => { await ref.current?.initCamera(); });
    await act(async () => { initial.resolve(oldStream); });
    expect(stopOld).toHaveBeenCalledOnce();
    expect(ref.current?.stream).toBe(newStream);
  });
});
