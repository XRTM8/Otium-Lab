import { expect, it } from 'vitest';
import { labIndexedDB, localStorage, scopedStorage } from './storage';
it('isolates data and clear from the stable application on the same origin', () => {
  globalThis.localStorage.setItem('otium_lang', 'en');
  localStorage.setItem('otium_lang', 'ar');
  expect(localStorage.getItem('otium_lang')).toBe('ar');
  expect(globalThis.localStorage.getItem('otium_lang')).toBe('en');
  expect(localStorage.length).toBe(1);
  expect(localStorage.key(0)).toBe('otium_lang');
  localStorage.clear();
  expect(localStorage.length).toBe(0);
  expect(globalThis.localStorage.getItem('otium_lang')).toBe('en');
});
it('does not adopt stable history as a fallback', () => {
  const isolated = scopedStorage(() => globalThis.localStorage, 'another-lab:');
  globalThis.localStorage.setItem('recent', 'private stable history');
  expect(isolated.getItem('recent')).toBeNull();
});
it('opens and deletes only the lab database, preserving the stable database', async () => {
  const open = (query: IDBOpenDBRequest) => new Promise<IDBDatabase>((resolve, reject) => {
    query.onsuccess = () => resolve(query.result); query.onerror = () => reject(query.error);
  });
  const stable = await open(globalThis.indexedDB.open('isolation-proof', 1));
  const lab = await open(labIndexedDB.open('isolation-proof', 1));
  expect(lab.name).not.toBe(stable.name);
  lab.close(); stable.close();
  await new Promise<void>((resolve, reject) => {
    const query = labIndexedDB.deleteDatabase('isolation-proof');
    query.onsuccess = () => resolve(); query.onerror = () => reject(query.error);
  });
  const names = (await globalThis.indexedDB.databases()).map(item => item.name);
  expect(names).toContain('isolation-proof');
  expect(names).not.toContain('otium-lab:isolation-proof');
});
