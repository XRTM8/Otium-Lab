import { beforeEach, describe, expect, it } from 'vitest';
import { listMedia, loadMedia, newMediaItem, removeMedia, storeMedia, updateMedia } from './library';

beforeEach(() => removeMedia());
describe('local media library', () => {
  it('keeps files with identical names separate and restores their contents', async () => {
    const first = new File(['first'], 'lesson.txt', { type: 'text/plain' });
    const second = new File(['second'], 'lesson.txt', { type: 'text/plain' });
    const a = newMediaItem(first), b = newMediaItem(second);
    await storeMedia(first, a); await storeMedia(second, b);
    expect(a.id).not.toBe(b.id);
    expect(await listMedia()).toHaveLength(2);
    expect(await (await loadMedia(a.id)).file.text()).toBe('first');
    expect(await (await loadMedia(b.id)).file.text()).toBe('second');
  });
  it('saves progress and removes both metadata and file', async () => {
    const file = new File(['slides'], 'lesson.pptx'), item = newMediaItem(file);
    await storeMedia(file, item);
    await updateMedia(item.id, { lastPage: 3, totalPages: 5, position: 12 });
    expect((await loadMedia(item.id)).item).toMatchObject({ lastPage: 3, totalPages: 5, position: 12 });
    await removeMedia(item.id);
    expect(await listMedia()).toEqual([]);
    await expect(loadMedia(item.id)).rejects.toThrow();
  });
  it('evicts the oldest entry at the history limit', async () => {
    let first = '';
    for (let index = 0; index < 13; index++) {
      const file = new File(['video'], `lesson-${index}.mp4`), item = newMediaItem(file);
      item.lastOpened = index + 1;
      if (!index) first = item.id;
      await storeMedia(file, item);
    }
    expect(await listMedia()).toHaveLength(12);
    await expect(loadMedia(first)).rejects.toThrow();
  });
});
