import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const version = process.argv[2] || '2.1.0';
const notes = process.argv[3] || 'Otium Sovereign Mobile Release';
const repo = process.env.GITHUB_REPOSITORY || 'XRTM8/Otium-Mobile';
const tag = `v${version.replace(/^v/, '')}`;

function sha256File(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

const releaseDir = path.join(rootDir, 'app', 'build', 'outputs', 'apk', 'release');
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Locate or copy canonical APKs into dist
const apkArm64Src = path.join(releaseDir, 'app-arm64-v8a-release.apk');
const apkUniversalSrc = path.join(releaseDir, 'app-universal-release.apk');

const apkArm64Target = path.join(distDir, `Otium-Lab_${version}_arm64-v8a.apk`);
const apkUniversalTarget = path.join(distDir, `Otium-Lab_${version}_universal.apk`);

if (fs.existsSync(apkArm64Src)) {
  fs.copyFileSync(apkArm64Src, apkArm64Target);
}
if (fs.existsSync(apkUniversalSrc)) {
  fs.copyFileSync(apkUniversalSrc, apkUniversalTarget);
}

if (!fs.existsSync(apkArm64Target) || !fs.existsSync(apkUniversalTarget)) {
  console.error('Missing generated release APKs in releaseDir or distDir!');
  process.exit(1);
}

const arm64Sha = sha256File(apkArm64Target);
const arm64Size = fs.statSync(apkArm64Target).size;
fs.writeFileSync(`${apkArm64Target}.sha256`, `${arm64Sha}  Otium-Lab_${version}_arm64-v8a.apk\n`);

const universalSha = sha256File(apkUniversalTarget);
const universalSize = fs.statSync(apkUniversalTarget).size;
fs.writeFileSync(`${apkUniversalTarget}.sha256`, `${universalSha}  Otium-Lab_${version}_universal.apk\n`);

const manifest = {
  version: version.replace(/^v/, ''),
  notes: notes,
  pub_date: new Date().toISOString(),
  assets: {
    androidArm64: {
      name: `Otium-Lab_${version}_arm64-v8a.apk`,
      url: `https://github.com/${repo}/releases/download/${tag}/Otium-Lab_${version}_arm64-v8a.apk`,
      sha256: arm64Sha,
      size: arm64Size
    },
    androidUniversal: {
      name: `Otium-Lab_${version}_universal.apk`,
      url: `https://github.com/${repo}/releases/download/${tag}/Otium-Lab_${version}_universal.apk`,
      sha256: universalSha,
      size: universalSize
    }
  }
};

const latestJsonPath = path.join(distDir, 'latest.json');
fs.writeFileSync(latestJsonPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Generated manifest at ${latestJsonPath}:`);
console.log(JSON.stringify(manifest, null, 2));
