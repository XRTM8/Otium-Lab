import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labVersion } from './lab-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const info = labVersion();
const labTag = `lab-${info.label}`;
const version = info.android;

const latestData = {
  version,
  tag_name: labTag,
  notes: `Otium Lab ${labTag} — Butter-smooth pinch-to-zoom, rock-solid motion stability, razor-sharp rendering, and instant zero-flash startup.`,
  pub_date: new Date().toISOString(),
  assets: {
    androidApk: {
      url: `https://github.com/XRTM8/Otium-Lab/releases/download/${labTag}/Otium-Lab-${info.label}-arm64-v8a.apk`
    }
  }
};

const jsonStr = JSON.stringify(latestData, null, 2);

const publicPath = path.join(root, 'public', 'latest.json');
writeFileSync(publicPath, jsonStr, 'utf8');

const docsPath = path.join(root, 'docs', 'latest.json');
if (existsSync(path.join(root, 'docs'))) {
  writeFileSync(docsPath, jsonStr, 'utf8');
}

console.log(`Generated latest.json for version ${version} (${labTag}).`);
