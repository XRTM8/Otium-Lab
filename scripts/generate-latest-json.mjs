import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labVersion } from './lab-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const info = labVersion();
const labTag = `lab-${info.label}`;
const version = info.android;

const apkName = `Otium-Lab-${info.label}-arm64-v8a.apk`;
const apkPath = path.resolve(process.argv[2] ?? path.join(root, apkName));
if (path.basename(apkPath) !== apkName) throw new Error(`Expected the release APK named ${apkName}`);
const apk = readFileSync(apkPath);
if (apk.length === 0) throw new Error('The release APK is empty');
const sha256 = createHash('sha256').update(apk).digest('hex');
const notes = readFileSync(path.join(root, 'release-notes.md'), 'utf8').split(/^# /m)[1]?.trim();
if (!notes) throw new Error('Release notes are missing');

const latestData = {
  version,
  tag_name: labTag,
  notes: notes.split(/\r?\n/).slice(1).join('\n').trim(),
  pub_date: new Date().toISOString(),
  platforms: {},
  assets: {
    androidApk: {
      url: `https://github.com/XRTM8/Otium-Lab/releases/download/${labTag}/${apkName}`,
      sha256,
      size: apk.length
    }
  }
};

const jsonStr = JSON.stringify(latestData, null, 2) + '\n';

const publicPath = path.join(root, 'public', 'latest.json');
writeFileSync(publicPath, jsonStr, 'utf8');
const docsPath = path.join(root, 'docs', 'latest.json');
if (existsSync(docsPath)) writeFileSync(docsPath, jsonStr, 'utf8');

console.log(`Generated latest.json for ${version} (${labTag}) with SHA-256 ${sha256}.`);
