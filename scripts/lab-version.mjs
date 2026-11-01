import { readFileSync } from 'node:fs';
export function labVersion() {
  const base = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const gradle = readFileSync(new URL('../src-tauri/gen/android/app/build.gradle.kts', import.meta.url), 'utf8');
  const build = Number(/val labBuild = (\d+)/.exec(gradle)?.[1]);
  if (!Number.isSafeInteger(build) || build <= 0) throw new Error('Missing Android Lab build number');
  return { base, build, label: String(build).padStart(2, '0'), android: `${base}-lab.${build}`, gradle };
}
