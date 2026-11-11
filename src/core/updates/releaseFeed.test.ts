// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { compareVersions, isNewerVersion, parseReleaseInfo } from './releaseFeed';
import * as runtime from '../../platform/runtime';
import { getUpdateAdapter } from '../../platform/updates';

describe('releaseFeed & platform update isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compares lab tags cleanly beyond 1.9.16 without hardcoded minor numbers', () => {
    expect(compareVersions('1.9.17-lab.14', '1.9.17-lab.13')).toBeGreaterThan(0);
    expect(compareVersions('lab-14', '1.9.17-lab.13')).toBeGreaterThan(0);
    expect(compareVersions('lab-13', '1.9.17-lab.13')).toBe(0);
    expect(compareVersions('1.9.17-lab.12', '1.9.17-lab.13')).toBeLessThan(0);
    expect(isNewerVersion('1.9.18-lab.14', '1.9.17-lab.13')).toBe(true);
  });

  it('parses release assets with HTTPS and sha256 guards', () => {
    const info = parseReleaseInfo({
      version: '1.9.17-lab.14',
      notes: 'Release notes',
      pub_date: '2026-11-11T00:00:00Z',
      assets: {
        androidApk: {
          url: 'https://github.com/XRTM8/Otium-Lab/releases/download/lab-14/Otium-Lab-14-arm64-v8a.apk',
          sha256: 'a'.repeat(64),
          size: 123456
        }
      }
    });
    expect(info.version).toBe('1.9.17-lab.14');
    expect(info.assets.androidApk?.sha256).toBe('a'.repeat(64));
  });

  it('returns null update adapter on web browsers so PWA does not prompt APK installs', () => {
    vi.spyOn(runtime, 'getPlatformId').mockReturnValue('web');
    expect(getUpdateAdapter()).toBeNull();
  });

  it('keeps platforms object present in latest.json feeds for Tauri v2 desktop updater compatibility', () => {
    for (const relPath of ['public/latest.json', 'docs/latest.json']) {
      const raw = readFileSync(resolve(process.cwd(), relPath), 'utf8');
      const parsed = JSON.parse(raw) as { platforms?: unknown };
      expect(parsed.platforms).toBeTypeOf('object');
      expect(parsed.platforms).not.toBeNull();
      expect(Array.isArray(parsed.platforms)).toBe(false);
    }
  });
});
