let cachedPdfJs: typeof import('pdfjs-dist') | null = null;

/** Lazily loads the PDF.js runtime and wires its worker script on demand. */
export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!cachedPdfJs) {
    const [lib, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    if (typeof window !== 'undefined' && 'Worker' in window) {
      lib.GlobalWorkerOptions.workerSrc = workerModule.default;
    }
    cachedPdfJs = lib;
  }
  return cachedPdfJs;
}
