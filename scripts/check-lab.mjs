import { readFileSync } from 'node:fs';
import { labVersion } from './lab-version.mjs';
const info = labVersion();
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checks = [
  ...['windows', 'linux', 'macos'].map(platform => [JSON.parse(read(`src-tauri/tauri.${platform}.conf.json`)).identifier === 'com.otium.reader.lab', `${platform} must use the Lab application identity`]),
  [read('src/components/WelcomeScreen.tsx').includes(`Otium Lab ${info.label}`), 'Homepage build number differs from Android'],
  [read('public/sw.js').includes(`-${info.label}'`), 'Offline cache build number differs from Android'],
  [info.gradle.includes('applicationIdSuffix = ".lab"'), 'Android release must use the separate Lab application ID'],
  [read('src/lab/storage.ts').includes("'otium-lab:'"), 'Lab storage isolation is missing'],
  [!read('src/platform/updates/index.ts').includes('androidUpdateAdapter'), 'Lab must not install stable updates'],
  [!process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY === 'XRTM8/Otium-Lab', 'Refusing to build a Lab deployment for another repository']
];
for (const [passed, message] of checks) if (!passed) throw new Error(message);
console.log(`Otium Lab ${info.label}: build, Android identity, storage and update isolation verified (${info.android}).`);
