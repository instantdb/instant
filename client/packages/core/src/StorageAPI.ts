import { jsonFetch } from './utils/fetch.js';

function isHeaderSafe(value: string): boolean {
  return /^[\x20-\x7e\xa0-\xff]*$/.test(value);
}

export type UploadFileResponse = {
  data: {
    id: string;
  };
};

export type DeleteFileResponse = {
  data: {
    id: string | null;
  };
};

export async function uploadFile({
  apiURI,
  appId,
  path,
  file,
  refreshToken,
  contentType,
  contentDisposition,
}: {
  apiURI: string;
  appId: string;
  path: string;
  file: File | Blob;
  refreshToken?: string;
  contentType?: string;
  contentDisposition?: string;
}): Promise<UploadFileResponse> {
  const headers = {
    'app-id': appId,
    app_id: appId,
    authorization: `Bearer ${refreshToken}`,
    'content-type': contentType || file.type,
  };
  if (isHeaderSafe(path)) {
    headers['path'] = path;
  }
  if (contentDisposition && isHeaderSafe(contentDisposition)) {
    headers['content-disposition'] = contentDisposition;
  }

  let url = `${apiURI}/storage/upload?app_id=${encodeURIComponent(appId)}&path=${encodeURIComponent(path)}`;
  if (contentDisposition) {
    url += `&content-disposition=${encodeURIComponent(contentDisposition)}`;
  }

  const data = await jsonFetch(url, {
    method: 'PUT',
    headers,
    body: file,
  });

  return data;
}

export async function deleteFile({
  apiURI,
  appId,
  path,
  refreshToken,
}: {
  apiURI: string;
  appId: string;
  path: string;
  refreshToken?: string;
}): Promise<DeleteFileResponse> {
  const { data } = await jsonFetch(
    `${apiURI}/storage/files?app_id=${appId}&filename=${encodeURIComponent(path)}`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${refreshToken}`,
      },
    },
  );

  return data;
}

// Deprecated Storage API (Jan 2025)
// ---------------------------------

export async function getSignedUploadUrl({
  apiURI,
  appId,
  fileName,
  refreshToken,
  metadata = {},
}: {
  apiURI: string;
  appId: string;
  fileName: string;
  refreshToken?: string;
  metadata?: Record<string, any>;
}) {
  const { data } = await jsonFetch(`${apiURI}/storage/signed-upload-url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${refreshToken}`,
    },
    body: JSON.stringify({
      app_id: appId,
      filename: fileName,
    }),
  });

  return data;
}

export async function upload(presignedUrl, file) {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  return response.ok;
}

export async function getDownloadUrl({
  apiURI,
  appId,
  path,
  refreshToken,
}: {
  apiURI: string;
  appId: string;
  path: string;
  refreshToken?: string;
}) {
  const { data } = await jsonFetch(
    `${apiURI}/storage/signed-download-url?app_id=${appId}&filename=${encodeURIComponent(
      path,
    )}`,
    {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${refreshToken}`,
      },
    },
  );

  return data;
}
