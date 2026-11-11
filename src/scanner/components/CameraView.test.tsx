// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorage as labStorage } from '../../lab/storage';
import { CameraView } from './CameraView';

let root: Root;
let host: HTMLDivElement;

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
}

function findButtonByTitle(title: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.getAttribute('title') === title);
}

describe('CameraView', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    labStorage.clear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows permission fallback when camera API is unavailable and triggers action callbacks', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onCapture = vi.fn();
    const onFinishBatch = vi.fn();
    const onOpenLibrary = vi.fn();
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <CameraView
          onCapture={onCapture}
          pagesCount={2}
          lastThumbnail="data:image/jpeg;base64,AAAA"
          onFinishBatch={onFinishBatch}
          onOpenLibrary={onOpenLibrary}
          onOpenSettings={onOpenSettings}
          onClose={onClose}
        />
      );
    });

    expect(host.textContent).toContain('إذن الكاميرا مطلوب');
    expect(host.textContent).toContain('صفحتان ممسوحتان');

    await act(async () => findButtonByText('هوية')?.click());
    expect(host.textContent).toContain('ضع الوجه الأمامي للهوية داخل الإطار');

    await act(async () => findButtonByText('مفرد')?.click());
    expect(host.textContent).toContain('صفحتان ممسوحتان');

    await act(async () => findButtonByText('يدوي')?.click());
    expect(host.textContent).toContain('تلقائي');
    expect(labStorage.getItem('otium_scan_auto_capture')).toBe('true');

    await act(async () => findButtonByTitle('خزنة المستندات المحفوظة')?.click());
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);

    await act(async () => findButtonByTitle('الإعدادات والتحديثات')?.click());
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await act(async () => findButtonByTitle('إنهاء ومراجعة ملف الـ PDF')?.click());
    expect(onFinishBatch).toHaveBeenCalledTimes(1);

    await act(async () => findButtonByTitle('إغلاق الماسح الضوئي')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('acquires camera stream when getUserMedia succeeds and stops tracks on unmount', async () => {
    const stop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ stop, getCapabilities: () => ({}), applyConstraints: vi.fn() }],
    } as unknown as MediaStream;

    const origSrcObjectDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
    let capturedSrcObject: unknown = null;
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get: () => capturedSrcObject,
      set: (v) => {
        capturedSrcObject = v;
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    try {
      await act(async () => {
        root.render(
          <CameraView
            onCapture={vi.fn()}
            pagesCount={0}
            onFinishBatch={vi.fn()}
          />
        );
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(capturedSrcObject).toBe(mockStream);
      expect(host.textContent).not.toContain('إذن الكاميرا مطلوب');
      await act(async () => root.unmount());
      expect(stop).toHaveBeenCalled();
    } finally {
      if (origSrcObjectDesc) {
        Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', origSrcObjectDesc);
      }
    }
  });
});
