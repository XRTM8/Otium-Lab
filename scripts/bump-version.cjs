const fs = require('fs');

const targetVersion = process.argv[2] || '1.9.17';
const numericCode = targetVersion.replace(/\D/g, '');
const targetLabBuild = process.argv[3] ? Number(process.argv[3]) : null;

// 1. package.json
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. package-lock.json
const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = targetVersion;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = targetVersion;
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

// 3. tauri.conf.json (Strictly preserve Lab identity and conflict-free endpoints)
const tauriConfPath = 'src-tauri/tauri.conf.json';
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = targetVersion;
tauriConf.productName = 'Otium Lab';
tauriConf.identifier = 'com.otium.reader.lab';
if (tauriConf.plugins?.updater) {
  tauriConf.plugins.updater.endpoints = [
    'https://xrtm8.github.io/Otium-Lab/latest.json',
    'https://github.com/XRTM8/Otium-Lab/releases/latest/download/latest.json'
  ];
}
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');

// 4. Cargo.toml
const cargoTomlPath = 'src-tauri/Cargo.toml';
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${targetVersion}"`);
fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');

// 5. Cargo.lock
const cargoLockPath = 'src-tauri/Cargo.lock';
if (fs.existsSync(cargoLockPath)) {
  let cLock = fs.readFileSync(cargoLockPath, 'utf8');
  cLock = cLock.replace(/(name = "otium"\r?\nversion = ")[^"]+(")/, `$1${targetVersion}$2`);
  fs.writeFileSync(cargoLockPath, cLock, 'utf8');
}

// 6. updater.ts
const updaterPath = 'src/scanner/core/updater.ts';
if (fs.existsSync(updaterPath)) {
  let updater = fs.readFileSync(updaterPath, 'utf8');
  updater = updater.replace(/APP_CURRENT_VERSION\s*=\s*(?:'[^']+'|getCurrentVersion\(\))/, `APP_CURRENT_VERSION = '${targetVersion}'`);
  fs.writeFileSync(updaterPath, updater, 'utf8');
}

// 7. release-notes.md
const notesPath = 'release-notes.md';
if (fs.existsSync(notesPath)) {
  let notes = fs.readFileSync(notesPath, 'utf8');
  notes = notes.replace(/^#\s*Otium\s*[0-9A-Za-z.-]+/m, `# Otium ${targetVersion}`);
  fs.writeFileSync(notesPath, notes, 'utf8');
}

// 8. tauri.properties
const propsPath = 'src-tauri/gen/android/app/tauri.properties';
if (fs.existsSync(propsPath)) {
  let props = fs.readFileSync(propsPath, 'utf8');
  props = props.replace(/^tauri\.android\.versionName=.+$/m, `tauri.android.versionName=${targetVersion}`);
  props = props.replace(/^tauri\.android\.versionCode=.+$/m, `tauri.android.versionCode=${numericCode || '1917'}`);
  fs.writeFileSync(propsPath, props, 'utf8');
}

// 9. Android build.gradle.kts labBuild
let currentLabBuild = targetLabBuild;
const gradlePath = 'src-tauri/gen/android/app/build.gradle.kts';
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  if (targetLabBuild) {
    gradle = gradle.replace(/val labBuild = \d+/, `val labBuild = ${targetLabBuild}`);
    fs.writeFileSync(gradlePath, gradle, 'utf8');
  } else {
    const match = /val labBuild = (\d+)/.exec(gradle);
    if (match) currentLabBuild = Number(match[1]);
  }
}

// 10. WelcomeScreen.tsx
if (currentLabBuild) {
  const welcomePath = 'src/components/WelcomeScreen.tsx';
  if (fs.existsSync(welcomePath)) {
    let welcome = fs.readFileSync(welcomePath, 'utf8');
    welcome = welcome.replace(/Otium Lab \d+/g, `Otium Lab ${currentLabBuild}`);
    fs.writeFileSync(welcomePath, welcome, 'utf8');
  }
}

// 11. sw.js (PWA Service Worker cache version)
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const labTag = currentLabBuild ? String(currentLabBuild).padStart(2, '0') : targetVersion;
for (const swPath of ['public/sw.js', 'docs/sw.js']) {
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/const CACHE_NAME = 'otium-lab-offline-[^']+';/, `const CACHE_NAME = 'otium-lab-offline-${dateStr}-${labTag}';`);
    fs.writeFileSync(swPath, sw, 'utf8');
  }
}

console.log(`Bumped Otium Lab to ${targetVersion} (Lab ${currentLabBuild || 'current'})`);
