// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../../app/useReaderController';
import { beamService } from './beamService';
import { BeamModal } from './BeamModal';

let host: HTMLDivElement;
let root: Root;

function fakeReader(hasDoc = false): ReaderController {
  return {
    doc: hasDoc ? ({ numPages: 4 } as ReaderController['doc']) : null,
    docId: 'doc-beam-test',
    docTitle: hasDoc ? 'Algebra.pdf' : '',
    currentPage: 2,
    numPages: hasDoc ? 4 : 0,
    theme: 'midnight',
    lang: 'ar',
    beamPeerConnected: false,
    beamRoom: null,
    beamRole: null,
    scrollToPage: vi.fn(),
    changeViewMode: vi.fn(),
    loadDocumentBytes: vi.fn(async () => {}),
  } as unknown as ReaderController;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  beamService.disconnect();
  vi.stubGlobal(
    'EventSource',
    class {
      onopen: (() => void) | null = null;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
    }
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  beamService.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BeamModal', () => {
  it('returns null when closed', async () => {
    await act(async () => {
      root.render(
        <BeamModal
          isOpen={false}
          lang="ar"
          reader={fakeReader()}
          formFactor="desktop"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });
    expect(host.innerHTML).toBe('');
  });

  it('auto-starts receiver on desktop without a document and switches across Send/Offline tabs', async () => {
    const startReceiverSpy = vi.spyOn(beamService, 'startReceiver');
    await act(async () => {
      root.render(
        <BeamModal
          isOpen
          lang="ar"
          reader={fakeReader(false)}
          formFactor="desktop"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
      await new Promise((r) => setTimeout(r, 15));
    });

    expect(startReceiverSpy).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('البث الذكي للسبورة');

    const sendTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('بث للسبورة')
    );
    await act(async () => {
      sendTabBtn?.click();
    });
    expect(host.querySelector('input[placeholder="OTM-XXXXXXXXXXXX"]')).not.toBeNull();

    const offlineTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('بدون إنترنت')
    );
    await act(async () => {
      offlineTabBtn?.click();
    });
    expect(host.querySelectorAll('input[type="file"]').length).toBe(3);
  });

  it('pairs as sender when room code is entered on handheld/send flow', async () => {
    const startSenderSpy = vi.spyOn(beamService, 'startSender');
    await act(async () => {
      root.render(
        <BeamModal
          isOpen
          lang="ar"
          reader={fakeReader(false)}
          formFactor="mobile"
          preferredRole="sender"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[placeholder="OTM-XXXXXXXXXXXX"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'OTM-ABCD1234EFGH');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const pairBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('كريموت') || b.textContent?.includes('اتصال')
    );
    expect(pairBtn).toBeDefined();
    await act(async () => {
      pairBtn!.click();
    });

    expect(startSenderSpy).toHaveBeenCalledWith('OTM-ABCD1234EFGH');
    expect(beamService.getRole()).toBe('sender');
  });
});
