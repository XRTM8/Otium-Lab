import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { build } from 'vite';

async function loadScannerModule(file) {
  const entry = path.resolve(fileURLToPath(new URL('../src/scanner/core/', import.meta.url)), file);
  const bundle = await build({ configFile: false, logLevel: 'error', build: { write: false, lib: { entry, formats: ['es'] } } });
  const output = (Array.isArray(bundle) ? bundle[0] : bundle).output[0];
  return import('data:text/javascript;base64,' + Buffer.from(output.code).toString('base64'));
}

const { automaticCropConfidence, detectDocumentPixels } = await loadScannerModule(process.env.OTIUM_SCANNER_DETECTOR ?? 'edgeDetection.ts');
const manifest = process.argv[2];
const heldOut = process.argv.includes('--held-out');
const groups = new Map();
const thresholds = new Map();

function syntheticCases() {
  const width = 240, height = 280;
  const cases = [];
  for (const kind of ['plain', 'shadow', 'faint', 'pattern', 'receipt', 'blank', 'clipped']) {
    for (let i = 0; i < 12; i++) {
      const left = kind === 'clipped' ? 0 : 30 + i % 4 * 3;
      const right = kind === 'receipt' ? left + 48 : 208 - i % 3 * 5;
      const top = 27 + i % 3 * 4;
      const bottom = 249 - i % 4 * 4;
      const skew = (i % 4 - 1) * 5;
      const polygon = [[left, top], [right, top + skew], [right - skew, bottom], [left + skew, bottom - skew]];
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const paper = kind !== 'blank' && polygon.every(([ax, ay], index) => {
            const [bx, by] = polygon[(index + 1) % 4];
            return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
          });
          const texture = kind === 'pattern' ? (Math.floor(x / 8) + Math.floor(y / 7)) % 2 * 44 : 0;
          const light = kind === 'shadow' && x + y * 0.42 > 158 + i * 3 ? -111 : 0;
          const base = kind === 'faint' ? (paper ? 228 : 218) : (paper ? 236 : 83 + texture);
          const shade = Math.max(4, base + light + (x * 7 + y * 13 + i) % 5 - 2);
          const offset = (y * width + x) * 4;
          data.fill(shade, offset, offset + 3);
          data[offset + 3] = 255;
        }
      }
      cases.push({ kind, width, height, data, corners: ['blank', 'clipped'].includes(kind) ? null : polygon.map(([x, y]) => [x / width, y / height]) });
    }
  }
  return cases;
}

async function loadCases(filename) {
  const input = await readFile(filename);
  if (!filename.endsWith('metadata.csv.gz')) return JSON.parse(input.toString('utf8'));

  const [header, ...rows] = gunzipSync(input).toString('utf8').trim().split(/\r?\n/);
  const columns = header.split(',');
  const index = Object.fromEntries(columns.map((name, i) => [name, i]));
  return rows.flatMap((row) => {
    const fields = row.split(',');
    if (heldOut && !fields[index.model_name].endsWith('005')) return [];
    if (Number(fields[index.frame_index]) % 17 !== (heldOut ? 8 : 0)) return [];
    const corners = ['tl', 'tr', 'br', 'bl'].map(corner => [
      Number(fields[index[corner + '_x']]) / 1920,
      Number(fields[index[corner + '_y']]) / 1080,
    ]);
    if (!corners.every(point => point.every(value => value > 0.005 && value < 0.995))) return [];
    return [{ image: fields[index.image_path], kind: fields[index.bg_name], corners }];
  });
}

async function* imageCases(filename) {
  const items = await loadCases(filename);
  for (const item of items) {
    if (typeof item.kind !== 'string' || typeof item.image !== 'string' ||
      (item.corners !== null && (!Array.isArray(item.corners) || item.corners.length !== 4 ||
        !item.corners.every(point => Array.isArray(point) && point.length === 2 &&
          point.every(value => Number.isFinite(value) && value >= 0 && value <= 1))))) {
      throw new Error('Invalid case in the scanner benchmark manifest');
    }
    const { data, info } = await sharp(path.resolve(path.dirname(filename), item.image))
      .autoOrient().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    yield { ...item, data: new Uint8ClampedArray(data), width: info.width, height: info.height };
  }
}

function measure(result, corners, width, height) {
  if (!corners) return result.isDocumentPresent ? 'falsePositive' : 'correct';
  if (!result.isDocumentPresent) return 'review';
  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  // Reference corner order follows the printed page, which may be rotated in the frame.
  const error = Math.min(...keys.map((_, offset) => Math.max(...keys.map((key, index) => {
    const [x, y] = corners[(index + offset) % keys.length];
    return Math.hypot(result.quad[key].x - x * width, result.quad[key].y - y * height);
  }))));
  return error / Math.hypot(width, height) <= 0.035 ? 'correct' : 'badCrop';
}

for await (const { kind, width, height, data, corners } of manifest ? imageCases(manifest) : syntheticCases()) {
  if (!groups.has(kind)) groups.set(kind, {});
  const row = groups.get(kind);
  for (const [label, useLines] of [['regions', false], ['regionsAndLines', true]]) {
    const result = row[label] ??= { correct: 0, review: 0, badCrop: 0, falsePositive: 0, timings: [] };
    const start = performance.now();
    const detected = detectDocumentPixels(data, width, height, useLines);
    result.timings.push(performance.now() - start);
    const outcome = measure(detected, corners, width, height);
    result[outcome]++;
    if (useLines) {
      const automatic = row.automaticCrop ??= { correct: 0, review: 0, badCrop: 0, falsePositive: 0, timings: [] };
      automatic.timings.push(result.timings.at(-1));
      const accepted = detected.confidence >= automaticCropConfidence ? detected : { ...detected, isDocumentPresent: false };
      automatic[measure(accepted, corners, width, height)]++;
      if (detected.isDocumentPresent && corners) {
        const bin = thresholds.get(detected.confidence) ?? { correct: 0, badCrop: 0 };
        bin[outcome]++;
        thresholds.set(detected.confidence, bin);
      }
    }
  }
}
async function measureFilters() {
  const wasmPath = new URL('../public/wasm/otium_wasm.wasm', import.meta.url);
  const { instance: { exports: wasm } } = await WebAssembly.instantiate(await readFile(wasmPath));
  const width = 320, height = 440;
  const image = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const paper = x < 160 ? 235 : 145;
      let ink = [paper, paper, paper];
      if (x > 36 && x < 120 && y > 100 && y < 145 && y % 7 < 2) ink = [paper - 28, paper - 28, paper - 28];
      if (x > 40 && x < 100 && y > 208 && y < 270 && (x + y) % 9 < 2) ink = [paper, paper - 80, paper - 70];
      if (x > 207 && x < 274 && y > 208 && y < 270 && (x + y) % 9 < 2) ink = [paper - 72, paper - 61, paper];
      image.set([...ink, 255], (y * width + x) * 4);
    }
  }
  const { applyAdaptiveBwFilter } = await loadScannerModule('filterPresets.ts');
  const ptr = wasm.otium_alloc(image.length);
  if (!ptr) throw new Error('Could not allocate the filter benchmark image');
  try {
    return Object.fromEntries([['original', 0], ['colorDocument', 1], ['previousBlackAndWhite', 4], ['blackAndWhite', null]].map(([name, filter]) => {
      new Uint8Array(wasm.memory.buffer, ptr, image.length).set(image);
      if (filter && wasm.otium_apply_filter_rgba(ptr, width, height, filter) !== 0) throw new Error('Could not run the WASM filter');
      const data = filter === null ? new Uint8ClampedArray(image) : new Uint8Array(wasm.memory.buffer, ptr, image.length);
      if (filter === null) applyAdaptiveBwFilter(data, width, height);
      const rgb = (x, y) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3));
      return [name, {
        faintInk: rgb(44, 105),
        nearbyPaper: rgb(43, 103),
        redInk: rgb(49, 212),
        blueInk: rgb(216, 216),
        shadowedPaper: rgb(288, 330),
        shadowBoundaryPaper: rgb(160, 330),
      }];
    }));
  } finally {
    wasm.otium_dealloc(ptr, image.length);
  }
}

const report = Object.fromEntries([...groups].map(([kind, row]) => [kind, Object.fromEntries(Object.entries(row).map(([engine, value]) => {
  const { timings, ...counts } = value;
  timings.sort((a, b) => a - b);
  return [engine, { ...counts, p95Ms: Math.round(timings[Math.ceil(timings.length * 0.95) - 1] * 10) / 10 }];
}))]));
console.log(JSON.stringify({ input: manifest ? 'labeled images' : 'synthetic images', report, confidenceCounts: Object.fromEntries(thresholds), ...(!manifest && { filterSamples: await measureFilters() }) }, null, 2));
