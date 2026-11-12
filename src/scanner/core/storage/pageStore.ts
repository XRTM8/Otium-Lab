/**
 * IndexedDB Page Storage Engine.
 * Swaps high-resolution raw images and canvases to local disk storage,
 * keeping only lightweight thumbnails in RAM.
 */
import { labIndexedDB } from '../../../lab/storage';
import type { FilterType } from '../types';
import {
  createImageFromBlob,
  generateThumbnailDataUrl,
  transformFilteredRecord,
  transformRotatedRecord,
  type StoredPageRecord,
} from './pageImageOps';

export {
  checkStorageQuota,
  clearActiveSessionPages,
  getActiveSessionPages,
  saveActiveSessionPages,
} from './pageSessionStorage';

const DB_NAME = 'otium_scan_storage';
const DB_VERSION = 1;
const STORE_NAME = 'scanned_pages';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = labIndexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        try {
          dbInstance?.close();
        } catch (err) {
          console.debug('[PageStore] db close skipped:', err);
        }
        dbInstance = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbInstance = null;
      reject(request.error);
    };

    request.onblocked = () => {
      dbInstance = null;
      reject(new Error('IndexedDB blocked'));
    };
  });
}

function readPageRecord(db: IDBDatabase, id: string): Promise<StoredPageRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredPageRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

function writePageRecord(db: IDBDatabase, record: StoredPageRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Saving the scan was interrupted'));
  });
}

function base64ToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.warn('base64ToBlob conversion error:', err);
    return new Blob([], { type: 'image/jpeg' });
  }
}

/** Saves a scanned page to local disk cache and returns its thumbnail. */
export async function storePageToDisk(
  id: string,
  originalDataUrl: string,
  warpedCanvas: HTMLCanvasElement,
  filteredCanvas: HTMLCanvasElement,
  filter: string
): Promise<string> {
  const originalBlob = base64ToBlob(originalDataUrl);
  const [warpedBlob, filteredBlob] = await Promise.all([
    new Promise<Blob>((resolve) =>
      warpedCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
    new Promise<Blob>((resolve) =>
      filteredCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
  ]);
  if (!originalBlob.size || !warpedBlob.size || !filteredBlob.size) {
    throw new Error('Could not encode the scanned page');
  }

  const aspect = filteredCanvas.width / Math.max(1, filteredCanvas.height);
  const thumbnailDataUrl = generateThumbnailDataUrl(filteredCanvas, aspect, 0.65);

  const record: StoredPageRecord = {
    id,
    originalBlob,
    warpedBlob,
    filteredBlob,
    thumbnailDataUrl,
    filter,
    timestamp: Date.now(),
  };

  const db = await getDB();
  await writePageRecord(db, record);
  return thumbnailDataUrl;
}

export async function loadOriginalDataUrlFromDisk(id: string): Promise<string> {
  const db = await getDB();
  const record = await readPageRecord(db, id);
  if (!record) {
    throw new Error(`Page not found: ${id}`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(record.originalBlob);
  });
}

export async function loadPageCanvasFromDisk(id: string): Promise<HTMLCanvasElement> {
  const db = await getDB();
  const record = await readPageRecord(db, id);
  if (!record) {
    throw new Error(`Page not found: ${id}`);
  }
  const img = await createImageFromBlob(record.filteredBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Rotates a stored page 90 degrees clockwise and updates cache and thumbnail. */
export async function rotateStoredPage(id: string): Promise<string> {
  const db = await getDB();
  const record = await readPageRecord(db, id);
  if (!record) throw new Error('Page not found');
  const updated = await transformRotatedRecord(record);
  await writePageRecord(db, updated);
  return updated.thumbnailDataUrl;
}

/** Updates the enhancement filter for a stored page and regenerates its thumbnail. */
export async function updateStoredPageFilter(id: string, filter: FilterType): Promise<string> {
  const db = await getDB();
  const record = await readPageRecord(db, id);
  if (!record) throw new Error('Page not found');
  const updated = await transformFilteredRecord(record, filter);
  await writePageRecord(db, updated);
  return updated.thumbnailDataUrl;
}

/** Deletes a stored page record from IndexedDB disk cache. */
export async function deleteStoredPage(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Duplicates a stored page record in IndexedDB under a new page ID. */
export async function duplicateStoredPage(sourceId: string, newId: string): Promise<void> {
  const db = await getDB();
  const record = await readPageRecord(db, sourceId);
  if (!record) return;
  await writePageRecord(db, {
    ...record,
    id: newId,
    timestamp: Date.now(),
  });
}

/** Clears current scan session from disk cache. */
export async function clearScanSession(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
