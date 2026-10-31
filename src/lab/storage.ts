// GitHub Pages projects share an origin. The lab must never mutate stable data.
export const LAB_PREFIX = 'otium-lab:';
export function scopedStorage(backing: () => Storage, prefix = LAB_PREFIX): Storage {
  const keys = () => {
    const source = backing(), result: string[] = [];
    for (let index = 0; index < source.length; index++) {
      const key = source.key(index);
      if (key?.startsWith(prefix)) result.push(key.slice(prefix.length));
    }
    return result;
  };
  return {
    get length() { return keys().length; },
    key: index => keys()[index] ?? null,
    getItem: key => backing().getItem(prefix + key),
    setItem: (key, value) => backing().setItem(prefix + key, value),
    removeItem: key => backing().removeItem(prefix + key),
    clear: () => { for (const key of keys()) backing().removeItem(prefix + key); }
  };
}
export const localStorage = scopedStorage(() => globalThis.localStorage);
export const sessionStorage = scopedStorage(() => globalThis.sessionStorage);
export const labIndexedDB = {
  open: (name: string, version?: number) => globalThis.indexedDB.open(LAB_PREFIX + name, version),
  deleteDatabase: (name: string) => globalThis.indexedDB.deleteDatabase(LAB_PREFIX + name)
};
