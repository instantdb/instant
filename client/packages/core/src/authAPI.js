import { jsonFetch } from "./utils/fetch";

export function sendMagicCode({ apiURI, appId, email }) {
  return jsonFetch(`${apiURI}/runtime/auth/send_magic_code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "app-id": appId, email }),
  });
}

export async function verifyMagicCode({ apiURI, appId, email, code }) {
  const res = await jsonFetch(`${apiURI}/runtime/auth/verify_magic_code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "app-id": appId, email, code }),
  });
  return res;
}

export async function verifyRefreshToken({ apiURI, appId, refreshToken }) {
  const res = await jsonFetch(`${apiURI}/runtime/auth/verify_refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      "app-id": appId,
      "refresh-token": refreshToken,
    }),
  });
  return res;
}

/**
 * @param {Object} params
 * @param {string} params.apiURI
 * @param {string} params.appId
 * @param {string} params.code
 * @param {string | null | undefined} [params.codeVerifier]
 */
export async function exchangeCodeForToken({
  apiURI,
  appId,
  code,
  codeVerifier,
}) {
  const res = await jsonFetch(`${apiURI}/runtime/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      code: code,
      code_verifier: codeVerifier,
    }),
  });
  return res;
}

/**
 * @param {Object} params
 * @param {string} params.apiURI
 * @param {string} params.appId
 * @param {string} params.clientName
 * @param {string} params.idToken
 * @param {string | null | undefined} [params.refreshToken]
 * @param {string | null | undefined} [params.nonce]
 */
export async function signInWithIdToken({
  apiURI,
  appId,
  nonce,
  idToken,
  clientName,
  refreshToken,
}) {
  const res = await jsonFetch(`${apiURI}/runtime/oauth/id_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      nonce,
      id_token: idToken,
      client_name: clientName,
      refresh_token: refreshToken,
    }),
  });
  return res;
}

/**
 * @param {Object} params
 * @param {string} params.apiURI
 * @param {string} params.appId
 * @param {string} params.refreshToken
 */
export async function signOut({ apiURI, appId, refreshToken }) {
  const res = await jsonFetch(`${apiURI}/runtime/signout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      refresh_token: refreshToken,
    }),
  });
  return res;
}
