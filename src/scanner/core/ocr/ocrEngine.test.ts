import { describe, expect, it } from 'vitest';
import { resolveOcrAssetBase } from './ocrEngine';

describe('resolveOcrAssetBase', () => {
  it('resolves relative to GitHub Pages subpath without escaping to root origin', () => {
    expect(
      resolveOcrAssetBase(
        'https://xrtm8.github.io/Otium-Lab/',
        'https://xrtm8.github.io/Otium-Lab/'
      )
    ).toBe('https://xrtm8.github.io/Otium-Lab/tesseract');

    expect(
      resolveOcrAssetBase(
        'https://xrtm8.github.io/Otium-Lab/index.html?view=scan#ocr',
        'https://xrtm8.github.io/Otium-Lab/index.html?view=scan#ocr'
      )
    ).toBe('https://xrtm8.github.io/Otium-Lab/tesseract');
  });

  it('resolves cleanly on Tauri desktop and Vite dev URLs', () => {
    expect(
      resolveOcrAssetBase('', 'http://tauri.localhost/index.html')
    ).toBe('http://tauri.localhost/tesseract');

    expect(
      resolveOcrAssetBase('http://localhost:5173/', 'http://localhost:5173/')
    ).toBe('http://localhost:5173/tesseract');
  });
});
