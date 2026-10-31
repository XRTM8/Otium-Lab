import { labIndexedDB } from '../lab/storage';
import type { RecentDocItem } from '../core/storage/documents';
import { describeFile } from './media';
export type MediaKind = 'video' | 'audio' | 'image' | 'text' | 'presentation';
export type MediaLibraryItem = RecentDocItem & { mediaKind: MediaKind; position: number };
export type MediaProgress = { lastPage: number; totalPages: number; position: number };
const SINGLE_LIMIT = 128 * 1024 ** 2, TOTAL_LIMIT = 256 * 1024 ** 2, COUNT_LIMIT = 12;
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = labIndexedDB.open('otium_media_library', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('items', { keyPath: 'id' }); request.result.createObjectStore('files'); };
    request.onsuccess = () => { const value = request.result; value.onversionchange = () => { value.close(); database = undefined; }; resolve(value); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Media storage is blocked by another tab.')); };
  });
  return database;
}
function request<T>(value: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }
export function mediaKind(file: Pick<File, 'name'>): MediaKind | null {
  const kind = describeFile(file.name).kind;
  return ['video', 'audio', 'image', 'text', 'presentation'].includes(kind) ? kind as MediaKind : null;
}
export function newMediaItem(file: File): MediaLibraryItem {
  const kind = mediaKind(file);
  if (!kind) throw new Error('Unsupported media');
  return { id: `media:${crypto.randomUUID()}`, name: file.name, mediaKind: kind, position: 0,
    lastOpened: Date.now(), lastPage: 1, totalPages: 1, sizeBytes: file.size, available: true };
}
export async function listMedia(): Promise<MediaLibraryItem[]> {
  const connection = await db();
  return (await request(connection.transaction('items').objectStore('items').getAll()) as MediaLibraryItem[])
    .filter(item => item && typeof item.id === 'string' && item.id.startsWith('media:') && typeof item.name === 'string' && mediaKind({ name: item.name }))
    .sort((a, b) => b.lastOpened - a.lastOpened);
}
export async function storeMedia(file: File, item: MediaLibraryItem): Promise<boolean> {
  if (file.size > SINGLE_LIMIT) return false;
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(['items', 'files'], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Media storage failed'));
    const items = tx.objectStore('items'), files = tx.objectStore('files');
    items.getAll().onsuccess = event => {
      const previous = (event.target as IDBRequest<MediaLibraryItem[]>).result.sort((a, b) => b.lastOpened - a.lastOpened);
      let bytes = file.size, count = 1;
      for (const old of previous) {
        if (old.id === item.id) continue;
        if (count >= COUNT_LIMIT || bytes + old.sizeBytes > TOTAL_LIMIT) { items.delete(old.id); files.delete(old.id); }
        else { bytes += old.sizeBytes; count++; }
      }
      items.put(item); files.put(file, item.id);
    };
  });
  return true;
}
export async function loadMedia(id: string) {
  const connection = await db(), tx = connection.transaction(['items', 'files']);
  const [item, blob] = await Promise.all([request(tx.objectStore('items').get(id)), request(tx.objectStore('files').get(id))]);
  if (!item || !(blob instanceof Blob)) throw new Error('الملف المحفوظ غير متاح. أعد اختياره من الجهاز.');
  return { item: item as MediaLibraryItem, file: new File([blob], item.name, { type: blob.type }) };
}
export async function updateMedia(id: string, progress: MediaProgress) {
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction('items', 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    const store = tx.objectStore('items'), query = store.get(id);
    query.onsuccess = () => { if (query.result) store.put({ ...query.result, lastOpened: Date.now(),
      lastPage: Math.max(1, Math.min(200, Math.round(progress.lastPage) || 1)), totalPages: Math.max(1, Math.min(200, Math.round(progress.totalPages) || 1)),
      position: Number.isFinite(progress.position) ? Math.max(0, progress.position) : 0 }); };
  });
}
export async function removeMedia(id?: string) {
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(['items', 'files'], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    for (const name of ['items', 'files']) { const store = tx.objectStore(name); if (id) store.delete(id); else store.clear(); }
  });
}
export const APP_FILE_ACCEPT = '.pdf,application/pdf,.mp4,.m4v,.webm,.mov,.mkv,.ogv,.mp3,.wav,.m4a,.ogg,.opus,.flac,.png,.jpg,.jpeg,.webp,.gif,.avif,.pptx,.ppsx,.txt,.md';
