export interface ReleaseAsset {
  url: string;
  size?: number;
  sha256?: string;
}

export interface ReleaseAssets {
  windowsInstaller?: ReleaseAsset;
  windowsPortable?: ReleaseAsset;
  androidApk?: ReleaseAsset;
}

export interface ReleaseInfo {
  version: string;
  notes: string;
  pubDate: string;
  assets: ReleaseAssets;
}

export const OTIUM_RELEASES_URL = 'https://github.com/XRTM8/Otium-Lab/releases/latest';
export const OTIUM_RELEASE_FEED_URL =
  'https://xrtm8.github.io/Otium-Lab/latest.json';
export const OTIUM_RELEASE_FEED_FALLBACK_URL =
  'https://github.com/XRTM8/Otium-Lab/releases/latest/download/latest.json';

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function parseVersionPart(version: string): { numbers: number[]; labNumber: number; prerelease: string } {
  const normalized = normalizeVersion(version);
  // Match lab tags like "lab-07" or "lab-7"
  const labMatch = normalized.match(/^lab-(\d+)/i);
  if (labMatch) {
    const num = Number.parseInt(labMatch[1], 10);
    return { numbers: [1, 9, 16], labNumber: num, prerelease: `lab.${num}` };
  }
  const [main, prerelease = ''] = normalized.split('-', 2);
  const numbers = main.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
  while (numbers.length < 3) numbers.push(0);

  // Extract lab number from prerelease like "lab.7" or "lab.04"
  const preLabMatch = prerelease.match(/lab\.?(\d+)/i);
  const labNumber = preLabMatch ? Number.parseInt(preLabMatch[1], 10) : 0;

  return { numbers, labNumber, prerelease };
}

/** Returns a positive number when candidate is newer than current. */
export function compareVersions(candidate: string, current: string): number {
  const left = parseVersionPart(candidate);
  const right = parseVersionPart(current);

  for (let index = 0; index < 3; index += 1) {
    const difference = left.numbers[index] - right.numbers[index];
    if (difference !== 0) return difference;
  }

  if (left.labNumber !== right.labNumber) {
    return left.labNumber - right.labNumber;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true });
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function parseAsset(value: unknown): ReleaseAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== 'string') return undefined;

  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;

  const asset: ReleaseAsset = { url: url.toString() };
  if (typeof record.size === 'number' && Number.isFinite(record.size) && record.size > 0) {
    asset.size = record.size;
  }
  if (typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(record.sha256)) {
    asset.sha256 = record.sha256.toLowerCase();
  }
  return asset;
}

export function parseReleaseInfo(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object') {
    throw new Error('Release feed is not an object');
  }

  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version.trim()) {
    throw new Error('Release feed has no version');
  }

  const rawAssets =
    record.assets && typeof record.assets === 'object'
      ? (record.assets as Record<string, unknown>)
      : {};

  return {
    version: normalizeVersion(record.version),
    notes: typeof record.notes === 'string' ? record.notes : '',
    pubDate:
      typeof record.pub_date === 'string'
        ? record.pub_date
        : typeof record.pubDate === 'string'
          ? record.pubDate
          : '',
    assets: {
      windowsInstaller: parseAsset(rawAssets.windowsInstaller),
      windowsPortable: parseAsset(rawAssets.windowsPortable),
      androidApk: parseAsset(rawAssets.androidApk)
    }
  };
}

async function fetchFromGitHubApi(signal?: AbortSignal): Promise<ReleaseInfo> {
  const res = await fetch('https://api.github.com/repos/XRTM8/Otium-Lab/releases/latest', {
    headers: { Accept: 'application/vnd.github.v3+json' },
    signal
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = await res.json();
  const apkAsset = Array.isArray(data.assets)
    ? data.assets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.apk'))
    : undefined;
  return {
    version: normalizeVersion(data.tag_name || data.name || ''),
    notes: typeof data.body === 'string' ? data.body : '',
    pubDate: typeof data.published_at === 'string' ? data.published_at : '',
    assets: {
      androidApk: apkAsset
        ? {
            url: apkAsset.browser_download_url,
            size: apkAsset.size
          }
        : undefined
    }
  };
}

export async function fetchReleaseInfo(
  url: string = OTIUM_RELEASE_FEED_URL,
  signal?: AbortSignal
): Promise<ReleaseInfo> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    // 1. Primary: GitHub Pages static JSON feed (no rate-limits, instant)
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (response.ok) {
        return parseReleaseInfo(await response.json());
      }
    } catch (_) {}

    // 2. Secondary: GitHub Release latest.json asset
    try {
      const fallbackRes = await fetch(OTIUM_RELEASE_FEED_FALLBACK_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (fallbackRes.ok) {
        return parseReleaseInfo(await fallbackRes.json());
      }
    } catch (_) {}

    // 3. Fallback: Direct GitHub API releases/latest
    return await fetchFromGitHubApi(controller.signal);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
