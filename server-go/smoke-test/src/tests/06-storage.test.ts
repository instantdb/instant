/** File storage smoke tests. */
import { describe, it, expect } from '../framework.js';
import { post, get, del, adminHeaders, TestApp, uuid } from '../helpers.js';

export async function storageTests(app: TestApp) {
  const headers = adminHeaders(app);

  await describe('File Storage', async () => {
    await it('upload file metadata', async () => {
      const data = await post('/admin/storage/upload', {
        path: 'avatars/alice.png',
        'content-type': 'image/png',
        'size-bytes': 2048,
      }, headers);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.path).toBe('avatars/alice.png');
    });

    await it('list files returns uploaded file', async () => {
      const data = await get(`/admin/storage/files?app_id=${app.id}`, headers);
      expect(data['$files']).toBeDefined();
      expect(data['$files'].length).toBeGreaterThan(0);

      const file = data['$files'].find((f: any) => f.path === 'avatars/alice.png');
      expect(file).toBeDefined();
      expect(file['content-type']).toBe('image/png');
    });

    await it('upload overwrites existing path', async () => {
      await post('/admin/storage/upload', {
        path: 'docs/readme.txt',
        'content-type': 'text/plain',
        'size-bytes': 100,
      }, headers);

      await post('/admin/storage/upload', {
        path: 'docs/readme.txt',
        'content-type': 'text/plain',
        'size-bytes': 200,
      }, headers);

      const data = await get(`/admin/storage/files?app_id=${app.id}`, headers);
      const matches = data['$files'].filter((f: any) => f.path === 'docs/readme.txt');
      expect(matches.length).toBe(1);
    });

    await it('delete file removes it', async () => {
      const upload = await post('/admin/storage/upload', {
        path: 'temp/delete-me.txt',
        'content-type': 'text/plain',
        'size-bytes': 50,
      }, headers);

      const result = await del('/admin/storage/files', {
        'file-id': upload.data.id,
      }, headers);
      expect(result.status).toBe('ok');

      const data = await get(`/admin/storage/files?app_id=${app.id}`, headers);
      const found = data['$files'].find((f: any) => f.path === 'temp/delete-me.txt');
      expect(found).toBeUndefined();
    });
  });
}
