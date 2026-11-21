import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const targetVersion = process.argv[2];
if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error("Usage: node scripts/bump-version.mjs <major.minor.patch>");
  process.exit(1);
}

const [major, minor, patch] = targetVersion.split('.').map(Number);
console.log(`Bumping Otium-Lab mobile version to ${targetVersion} (major=${major}, minor=${minor}, patch=${patch})...`);

// 1. Update app/build.gradle.kts
const gradlePath = path.join(rootDir, 'app', 'build.gradle.kts');
let gradleContent = fs.readFileSync(gradlePath, 'utf8');
gradleContent = gradleContent.replace(/val versionMajor = \d+/, `val versionMajor = ${major}`);
gradleContent = gradleContent.replace(/val versionMinor = \d+/, `val versionMinor = ${minor}`);
gradleContent = gradleContent.replace(/val versionPatch = \d+/, `val versionPatch = ${patch}`);
fs.writeFileSync(gradlePath, gradleContent, 'utf8');
console.log(`Updated ${gradlePath}`);

// 2. Update Cargo.toml
const cargoPath = path.join(rootDir, 'Cargo.toml');
let cargoContent = fs.readFileSync(cargoPath, 'utf8');
cargoContent = cargoContent.replace(/(\[workspace\.package\][\s\S]*?version\s*=\s*)"[^"]+"/, `$1"${targetVersion}"`);
fs.writeFileSync(cargoPath, cargoContent, 'utf8');
console.log(`Updated ${cargoPath}`);

console.log(`Version successfully bumped to ${targetVersion}`);
