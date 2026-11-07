import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labVersion } from './lab-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const info = labVersion();
const labTag = `lab-${info.label}`;
const version = info.android;

const apkName = `Otium-Lab-${info.label}-arm64-v8a.apk`;
const apkPath = path.join(root, apkName);

let sha256 = undefined;
let size = undefined;

if (existsSync(apkPath)) {
  const buf = readFileSync(apkPath);
  sha256 = createHash('sha256').update(buf).digest('hex');
  size = buf.length;
}

const latestData = {
  version,
  tag_name: labTag,
  notes: `Otium Lab ${labTag} - Rock-solid zoom stability, zero page flipping, clean memory architecture, and seamless auto-updates.`,
  pub_date: new Date().toISOString(),
  assets: {
    androidApk: {
      url: `https://github.com/XRTM8/Otium-Lab/releases/download/${labTag}/${apkName}`,
      ...(sha256 ? { sha256, size } : {})
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

console.log(`Generated latest.json for version ${version} (${labTag})${sha256 ? ' with SHA-256: ' + sha256 : ''}.`);
