import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const version = packageJson.version;
const labMatch = version.match(/lab\.?(\d+)/i);
const buildNum = labMatch ? String(labMatch[1]).padStart(2, '0') : '07';
const labTag = `lab-${buildNum}`;

const latestData = {
  version,
  tag_name: labTag,
  notes: `Otium Lab ${labTag} — Instant zero-flash startup, razor-sharp PDF zoom, and automatic in-app updates.`,
  pub_date: new Date().toISOString(),
  assets: {
    androidApk: {
      url: `https://github.com/XRTM8/Otium-Lab/releases/download/${labTag}/Otium-Lab-${buildNum}-arm64-v8a.apk`
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
