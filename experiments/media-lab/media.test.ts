import { describe, expect, it, vi } from 'vitest';
import { describeFile, validateFile, fitSize, formatTime, SourceLease, mediaErrorMessage, captureErrorMessage, powerPointEmbedUrl } from './media';

describe('media file policy', () => {
  it('accepts known extensions with empty browser MIME but never trusts HTML/SVG', () => {
    expect(describeFile('lesson.MP4')).toMatchObject({ kind: 'video', mime: 'video/mp4' });
    for (const name of ['lesson.html', 'lesson.svg', 'lesson.mp4.exe', 'lesson.pptm', 'lesson']) {
      expect(validateFile({ name, size: 10 })).toBeTruthy();
    }
  });
  it('uses bounded reads for text and PDF and rejects empty files', () => {
    expect(validateFile({ name: 'notes.txt', size: 3 * 1024 ** 2 })).toBeTruthy();
    expect(validateFile({ name: 'notes.pdf', size: 81 * 1024 ** 2 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 3 * 1024 ** 3 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 0 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 100_000_000 })).toBeNull();
  });
  it('routes PowerPoint to engine guidance, never falsely to a static slide renderer', () => {
    expect(describeFile('lecture.pptx').kind).toBe('presentation');
    expect(describeFile('lecture.ppt').kind).toBe('presentation');
    expect(describeFile('book.docx').kind).toBe('office');
  });
  it('explains a failed decoder and cancelled screen picker', () => {
    expect(mediaErrorMessage(4)).toContain('H.264');
    expect(captureErrorMessage(new DOMException('', 'NotAllowedError'))).toContain('إعادة المحاولة');
  });
});

describe('source lifecycle', () => {
  const setup = () => {
    const urls = { createObjectURL: vi.fn(() => 'blob:local-1'), revokeObjectURL: vi.fn() };
    return { urls, lease: new SourceLease(urls) };
  };
  const mockStream = () => {
    const stop = vi.fn();
    return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
  };
  it('revokes a video URL when another file opens or the workspace closes', () => {
    const { lease, urls } = setup();
    lease.file(lease.replace(), new Blob(['video']));
    lease.replace();
    lease.replace();
    expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local-1');
  });
  it('stops a late screen-share result after the user has cancelled or opened another file', () => {
    const { lease } = setup();
    const picker = lease.replace();
    lease.replace();
    const capture = mockStream();
    expect(lease.capture(picker, capture.stream)).toBe(false);
    expect(capture.stop).toHaveBeenCalledOnce();
  });
  it('stops accepted capture tracks on close', () => {
    const { lease } = setup();
    const capture = mockStream();
    expect(lease.capture(lease.replace(), capture.stream)).toBe(true);
    lease.replace();
    expect(capture.stop).toHaveBeenCalledOnce();
  });
  it('prevents an obsolete text read or file open from replacing the current document', () => {
    const { lease, urls } = setup();
    const first = lease.replace();
    const second = lease.replace();
    expect(lease.current(first)).toBe(false);
    expect(lease.current(second)).toBe(true);
    expect(lease.file(first, new Blob(['stale']))).toBeNull();
    expect(urls.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('Microsoft embedding boundary', () => {
  it('allows an existing official OneDrive embed link', () => {
    expect(powerPointEmbedUrl(' https://onedrive.live.com/embed?resid=ABC!123&authkey=TEST ')).toBe('https://onedrive.live.com/embed?resid=ABC!123&authkey=TEST');
  });
  it('rejects scripts, short links, lookalike hosts, credentials, alternate ports and arbitrary pages', () => {
    for (const url of ['javascript:alert(1)', 'http://onedrive.live.com/embed?resid=1', 'https://onedrive.live.com.attacker.test/embed?resid=1', 'https://onedrive.live.com@attacker.test/embed?resid=1', 'https://user@onedrive.live.com/embed?resid=1', 'https://onedrive.live.com:8443/embed?resid=1', 'https://onedrive.live.com/view?resid=1', 'https://onedrive.live.com/embed', 'https://1drv.ms/p/abc', '<iframe src="https://onedrive.live.com/embed?resid=1"></iframe>']) {
      expect(powerPointEmbedUrl(url)).toBeNull();
    }
  });
});

describe('presentation geometry', () => {
  it('keeps the source aspect ratio across portrait and landscape workspaces', () => {
    for (const space of [{ width: 375, height: 600 }, { width: 1800, height: 600 }, { width: 600, height: 1800 }]) {
      const fitted = fitSize(space, { width: 1920, height: 1080 });
      expect(fitted.width / fitted.height).toBeCloseTo(1920 / 1080);
      expect(fitted.width).toBeLessThanOrEqual(space.width);
      expect(fitted.height).toBeLessThanOrEqual(space.height);
    }
  });
  it('survives a zero-sized layout during rotation', () => {
    expect(fitSize({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toEqual({ width: 0, height: 0 });
  });
  it('does not show NaN while media metadata is pending', () => {
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(125.8)).toBe('2:05');
  });
});
