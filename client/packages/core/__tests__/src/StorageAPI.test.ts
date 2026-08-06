import { afterEach, expect, test, vi } from 'vitest';

import { uploadFile } from '../../src/StorageAPI';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('uploadFile sends the app id in a hyphenated header', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { id: 'file-id' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await uploadFile({
    apiURI: 'https://api.example.com',
    appId: 'app-id',
    path: 'photos/demo.png',
    file: new Blob(['file'], { type: 'image/png' }),
    refreshToken: 'refresh-token',
  });

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(init.headers).toMatchObject({ 'app-id': 'app-id' });
  expect(init.headers).not.toHaveProperty('app_id');
});
