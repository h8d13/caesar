import { files } from '@caesar/shared/db/schema';
import { tdb } from '@server/__tests__/setup';
import { describe, expect, test } from 'vite-plus/test';
import { removeFile } from '../../mutations/files';
import { updateSettings } from '../../mutations/server';
import { getSettings } from '../server';

const insertLogo = () =>
  tdb
    .insert(files)
    .values({
      name: 'cache-logo.png',
      originalName: 'logo.png',
      md5: 'x',
      userId: 1,
      size: 1,
      mimeType: 'image/png',
      extension: '.png',
      createdAt: Date.now()
    })
    .returning()
    .get();

describe('getSettings cache', () => {
  test('serves the same object until a write invalidates it', async () => {
    const first = await getSettings();

    expect(await getSettings()).toBe(first);

    await updateSettings({ name: 'Renamed' });

    expect((await getSettings()).name).toBe('Renamed');
  });

  test('sees a new logo and its removal on the next read', async () => {
    expect((await getSettings()).logo).toBeNull();

    const logo = await insertLogo();

    await updateSettings({ logoId: logo.id });

    expect((await getSettings()).logo?.id).toBe(logo.id);

    // FK `set null` clears settings.logoId behind updateSettings' back
    await removeFile(logo.id);

    const after = await getSettings();

    expect(after.logoId).toBeNull();
    expect(after.logo).toBeNull();
  });

  test('a read in flight across a write cannot repopulate the cache', async () => {
    const stale = getSettings();

    await updateSettings({ name: 'Newer' });

    const fresh = getSettings();

    // the old read finishing after the write must not win
    await stale;

    expect((await fresh).name).toBe('Newer');
    expect((await getSettings()).name).toBe('Newer');
  });

  test('returns a frozen object', async () => {
    const current = await getSettings();

    expect(Object.isFrozen(current)).toBe(true);
    expect(() => {
      (current as { name: string }).name = 'mutated';
    }).toThrow(TypeError);
  });
});
