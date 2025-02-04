import { User } from './clientTypes';
import { jsonFetch } from './utils/fetch';

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

export type VerifyMagicCodeParams = { email: string; code: string };
export type VerifyResponse = {
  user: User;
};
export async function verifyMagicCode({
  apiURI,
  appId,
  email,
  code,
}: SharedInput & VerifyMagicCodeParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/auth/verify_magic_code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 'app-id': appId, email, code }),
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

export type ExchangeCodeForTokenParams = {
  code: string;
  codeVerifier?: string;
};

export async function exchangeCodeForToken({
  apiURI,
  appId,
  code,
  codeVerifier,
}: SharedInput & ExchangeCodeForTokenParams): Promise<VerifyResponse> {
  const res = await jsonFetch(`${apiURI}/runtime/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      code: code,
      code_verifier: codeVerifier,
    }),
  });
  return res;
}

export type SignInWithIdTokenParams = {
  nonce?: string;
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
