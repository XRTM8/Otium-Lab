import { readFileSync } from 'node:fs';
import { labVersion } from './lab-version.mjs';
const info = labVersion();
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const tauriBase = JSON.parse(read('src-tauri/tauri.conf.json'));
const androidManifest = read('src-tauri/gen/android/app/src/main/AndroidManifest.xml');
const androidStrings = read('src-tauri/gen/android/app/src/main/res/values/strings.xml');

const checks = [
  // 1. Desktop platform overlay identity guards
  ...['windows', 'linux', 'macos'].map(platform => [
    JSON.parse(read(`src-tauri/tauri.${platform}.conf.json`)).identifier === 'com.otium.reader.lab',
    `${platform} must use the Lab application identity (com.otium.reader.lab)`
  ]),

  // 2. Base tauri.conf.json conflict-prevention guards
  [tauriBase.identifier === 'com.otium.reader.lab', 'Base tauri.conf.json must use com.otium.reader.lab identity'],
  [tauriBase.productName === 'Otium Lab', 'Base tauri.conf.json must use product name "Otium Lab"'],
  [
    Array.isArray(tauriBase.plugins?.updater?.endpoints) &&
    tauriBase.plugins.updater.endpoints.every(url => url.toLowerCase().includes('otium-lab')),
    'Base tauri.conf.json updater endpoints must strictly point to Otium-Lab to prevent package overwrite'
  ],

  // 3. Android identity and authority guards (eliminates INSTALL_FAILED_DUPLICATE_PERMISSION)
  [info.gradle.includes('applicationIdSuffix = ".lab"'), 'Android release must use separate Lab application ID suffix (.lab)'],
  [androidManifest.includes('android:authorities="${applicationId}.fileprovider"'), 'AndroidManifest must namespace FileProvider with ${applicationId}'],
  [androidStrings.includes('Otium Lab'), 'Android strings.xml app_name must be "Otium Lab"'],

  // 4. UI & Cache version alignment guards
  [read('src/components/WelcomeScreen.tsx').includes(`Otium Lab ${info.label}`), 'Homepage build number differs from Android'],
  [read('public/sw.js').includes(`-${info.label}'`), 'Offline cache build number differs from Android'],

  // 5. Storage and Feed isolation guards
  [read('src/lab/storage.ts').includes("'otium-lab:'"), 'Lab storage isolation is missing'],
  [read('src/core/updates/releaseFeed.ts').includes('XRTM8/Otium-Lab'), 'Lab must point to Otium-Lab update feed'],
  [read('src-tauri/gen/android/app/src/main/java/com/otium/reader/AndroidUpdateBridge.kt').includes('Otium-Lab'), 'Android update bridge must point to Otium-Lab feed'],
  [!process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY === 'XRTM8/Otium-Lab', 'Refusing to build a Lab deployment for another repository']
];

for (const [passed, message] of checks) {
  if (!passed) throw new Error(message);
}

console.log(`Otium Lab ${info.label}: build, Android identity, storage, FileProvider authority, and update isolation verified (${info.android}).`);
