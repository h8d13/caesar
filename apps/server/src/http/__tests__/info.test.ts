import type { TServerInfo, TTempFile } from '@caesar/shared';
import { initTest, loginToken, uploadFile } from '@server/__tests__/helpers';
import { testsBaseUrl } from '@server/__tests__/setup';
import { describe, expect, test } from 'vite-plus/test';

describe('/info', () => {
  // pre-auth: exactly what the login screen renders, nothing more
  test('should return server info', async () => {
    const response = await fetch(`${testsBaseUrl}/info`);

    expect(response.status).toBe(200);

    const data = (await response.json()) as TServerInfo;

    expect(Object.keys(data).sort()).toEqual(['description', 'logo', 'name']);
    expect(data.name).toBe('Test Server');
    expect(data.description).toBe('Test server description');
  });

  // /info and the logo file are the only pre-auth views of an upload: the
  // stored name is all a visitor needs, uploader metadata must stay behind
  test('pre-auth logo exposes only its stored file name', async () => {
    const { caller } = await initTest(1);
    const token = await loginToken('testowner', 'password123');
    const uploadResponse = await uploadFile(
      new File(['logo content'], 'my-private-name.png', { type: 'image/png' }),
      token
    );
    const tempFile = (await uploadResponse.json()) as TTempFile;

    await caller.others.changeLogo({ fileId: tempFile.id });

    const info = (await (
      await fetch(`${testsBaseUrl}/info`)
    ).json()) as TServerInfo;

    expect(Object.keys(info.logo ?? {})).toEqual(['name']);

    const logoResponse = await fetch(
      `${testsBaseUrl}/public/${encodeURIComponent(info.logo!.name)}`
    );
    const disposition = logoResponse.headers.get('Content-Disposition');

    expect(logoResponse.status).toBe(200);
    expect(disposition).toContain(`filename="${info.logo!.name}"`);
    expect(disposition).not.toContain('my-private-name');

    await caller.others.changeLogo({});
  });
});
