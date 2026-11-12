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

  it('marks permission denied gracefully when camera mediaDevices API is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });

    const ref: { current: ReturnType<typeof useCameraCapture> | null } = { current: null };
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
        setTorchOn: vi.fn(),
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
    await act(async () => {
      await Promise.resolve();
    });

    expect(ref.current?.hasPermission).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});
