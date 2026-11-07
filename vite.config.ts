import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

const gradle = readFileSync(
  new URL('./src-tauri/gen/android/app/build.gradle.kts', import.meta.url),
  'utf8'
);
const labBuild = Number(/val labBuild = (\d+)/.exec(gradle)?.[1]);
const appVersion = Number.isSafeInteger(labBuild)
  ? `${packageJson.version}-lab.${labBuild}`
  : packageJson.version;

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    {
      name: 'strip-woff-fontsource',
      enforce: 'pre',
      transform(code, id) {
        if (id.includes('@fontsource') && id.endsWith('.css')) {
          return {
            code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g, ''),
            map: null,
          };
        }
      },
    },
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
          .replace("connect-src 'self'", "connect-src 'self' http://localhost:5173 ws://localhost:5173");
      },
    },
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdfjs-core';
          }
          if (id.includes('node_modules/tesseract.js')) {
            return 'tesseract-ocr';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  }
})
