import { jsonFetch } from "./utils/fetch";

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
  file: File;
  refreshToken?: string;
  contentType?: string;
  contentDisposition?: string;
}) {
  const formData = new FormData();
  formData.append('app_id', appId);
  formData.append('path', path);
  formData.append('file', file);
  formData.append('content-type', contentType || file.type);
  if (contentDisposition) formData.append('content-disposition', contentDisposition);

  const data = await jsonFetch(`${apiURI}/storage/upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${refreshToken}`,
    },
    body: formData,
  });

  return data;
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
    `${apiURI}/storage/signed-download-url?app_id=${appId}&filename=${encodeURIComponent(path)}`,
    {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${refreshToken}`,
      },
    },
  );

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
}) {
  const { data } = await jsonFetch(
    `${apiURI}/storage/files?app_id=${appId}&filename=${encodeURIComponent(path)}`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
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
    method: "POST",
    headers: {
      "content-type": "application/json",
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
  console.log("presignedUrl", presignedUrl);
  const response = await fetch(presignedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  return response.ok;
}
