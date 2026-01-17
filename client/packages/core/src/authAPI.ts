import { User } from './clientTypes.ts';
import { jsonFetch } from './utils/fetch.js';

type SharedInput = {
  apiURI: string;
  appId: string;
};

export type SendMagicCodeParams = { email: string };
export type SendMagicCodeResponse = {
  sent: true;
};

export function sendMagicCode({
  apiURI,
  appId,
  email,
}: SharedInput & SendMagicCodeParams): Promise<SendMagicCodeResponse> {
  return jsonFetch(`${apiURI}/runtime/auth/send_magic_code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 'app-id': appId, email }),
  });
}

export type VerifyMagicCodeParams = {
  email: string;
  code: string;
  refreshToken?: string | undefined;
};
export type VerifyResponse = {
  user: User;
};
export async function verifyMagicCode({
  apiURI,
  appId,
  email,
  code,
  refreshToken,
}: SharedInput & VerifyMagicCodeParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/auth/verify_magic_code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      'app-id': appId,
      email,
      code,
      ...(refreshToken ? { 'refresh-token': refreshToken } : {}),
    }),
  });
  return res;
}

export type VerifyRefreshTokenParams = { refreshToken: string };
export async function verifyRefreshToken({
  apiURI,
  appId,
  refreshToken,
}: SharedInput & VerifyRefreshTokenParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/auth/verify_refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      'app-id': appId,
      'refresh-token': refreshToken,
    }),
  });
  return res;
}

export async function signInAsGuest({
  apiURI,
  appId,
}: SharedInput): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/auth/sign_in_guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      'app-id': appId,
    }),
  });
  return res;
}

export type ExchangeCodeForTokenParams = {
  code: string;
  codeVerifier?: string;
  refreshToken?: string | undefined;
};

export async function exchangeCodeForToken({
  apiURI,
  appId,
  code,
  codeVerifier,
  refreshToken,
}: SharedInput & ExchangeCodeForTokenParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      code: code,
      code_verifier: codeVerifier,
      refresh_token: refreshToken,
    }),
  });
  return res;
}

export type SignInWithIdTokenParams = {
  nonce?: string | null | undefined;
  idToken: string;
  clientName: string;
  refreshToken?: string;
};

export async function signInWithIdToken({
  apiURI,
  appId,
  nonce,
  idToken,
  clientName,
  refreshToken,
}: SharedInput & SignInWithIdTokenParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/oauth/id_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

export type SignoutParams = { refreshToken: string };
export async function signOut({
  apiURI,
  appId,
  refreshToken,
}: SharedInput & SignoutParams): Promise<{}> {
  const res = await jsonFetch(`${apiURI}/runtime/signout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      refresh_token: refreshToken,
    }),
  });
  return res;
}
