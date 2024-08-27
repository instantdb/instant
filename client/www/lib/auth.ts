import Cookies from 'js-cookie';
import { useContext, useEffect, useState } from 'react';
import useSwr, { SWRResponse } from 'swr';
import config from './config';
import { jsonFetch, jsonMutate } from './fetch';
import { TokenContext } from '@/lib/contexts';
import { InstantError } from './types';
import { capitalize } from 'lodash';
import produce, { Draft } from 'immer';

// ----------
// Auth State

type Sub = (token: string | undefined) => void;
type AuthInfo = { token: string | undefined };
export type APIResponse<Data> = SWRResponse<Data> & {
  optimisticUpdate: <MutationResponse>(
    mutationPromiseToWaitFor: Promise<MutationResponse>,
    optimisticDataProducer?: (d: Draft<Data>) => void
  ) => Promise<MutationResponse>;
};

function recordLoggedInStateInCookie(authInfo: AuthInfo) {
  Cookies.set('loggedIn', `${authInfo.token ? 1 : 0}`, { expires: 365 });
}

function bootstrapAuthInfo(): AuthInfo {
  const empty = { token: undefined };
  if (typeof window == 'undefined') return empty;
  const fromStorage = localStorage.getItem('@AUTH');
  const res = fromStorage ? JSON.parse(fromStorage) : empty;
  recordLoggedInStateInCookie(res);
  return res;
}

function saveAuthInfo(authInfo: AuthInfo) {
  recordLoggedInStateInCookie(authInfo);
  localStorage.setItem('@AUTH', JSON.stringify(authInfo));
}

const _AUTH_INFO = bootstrapAuthInfo();

let _SUBS: Array<{ fn: Sub }> = [];

function subscribe(fn: Sub) {
  const sub = { fn };
  _SUBS.push(sub);
  return () => {
    _SUBS = _SUBS.filter((x) => x !== sub);
  };
}

function change(newToken: string | undefined) {
  _AUTH_INFO.token = newToken;
  saveAuthInfo(_AUTH_INFO);
  _SUBS.forEach(({ fn }) => fn(_AUTH_INFO.token));
}

// --------
// Hooks

export function useAuthToken(): string | undefined {
  const [authToken, setAuthToken] = useState(_AUTH_INFO.token);
  useEffect(() => {
    const unsub = subscribe((newToken) => {
      setAuthToken(newToken);
    });
    return unsub;
  }, []);
  return authToken;
}

export function useAuthedFetch<Res = any>(path: string) {
  const token = useContext(TokenContext);
  return useTokenFetch<Res>(path, token);
}

export function useTokenFetch<Res>(
  path: string,
  token?: string
): APIResponse<Res> {
  const res = useSwr<Res, any, [string, string] | null>(
    path && token ? [path, token] : null,
    async ([path, token]) => {
      const res = await fetch(path, {
        headers: { authorization: `Bearer ${token}` },
      });
      const jsonRes = await res.json();
      if (!res.ok) {
        throw new Error(jsonRes?.message);
      }
      return jsonRes;
    },
    {
      keepPreviousData: true,
    }
  );

  return {
    ...res,
    optimisticUpdate: (
      mutationPromiseToWaitFor,
      optimisticDataProducer
    ): any => {
      return optimisticUpdate(
        res,
        mutationPromiseToWaitFor,
        optimisticDataProducer
      );
    },
  };
}

// --------
// Error Messages

const friendlyName = (s: string) => {
  return s.replaceAll(/[_-]/g, ' ');
};

const friendlyNameFromIn = (inArr: string[]) => {
  return friendlyName(inArr[inArr.length - 1]);
};

export const messageFromInstantError = (
  e: InstantError
): string | undefined => {
  const body = e.body;
  if (!body) return;
  switch (body.type) {
    case 'param-missing':
      return `${capitalize(friendlyNameFromIn(body.hint.in))} is missing.`;
    case 'param-malformed':
      return `${capitalize(friendlyNameFromIn(body.hint.in))} is malformed`;
    case 'record-not-found':
      return `We couldn't find this ${friendlyName(body.hint['record-type'])}`;
    case 'record-not-unique':
      return `This ${friendlyName(body.hint['record-type'])} already exists`;
    case 'validation-failed':
      const error = body.hint.errors?.[0]?.message;
      if (typeof error === 'string') {
        return error;
      }
      return;
    default:
      return body.message;
  }
};

// --------
// Auth API

export function sendMagicCode({ email }: { email: string }) {
  return jsonFetch(`${config.apiURI}/dash/auth/send_magic_code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicCode({
  email,
  code,
}: {
  email: string;
  code: string;
}) {
  const res: { token: string } = await jsonFetch(
    `${config.apiURI}/dash/auth/verify_magic_code`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code }),
    }
  );
  change(res.token);
  return res;
}

export async function signOut() {
  try {
    const token = _AUTH_INFO.token;
    if (token) {
      await jsonFetch(`${config.apiURI}/dash/signout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
    }
  } catch (e) {
    console.error('Error signing out', e);
  }
  change(undefined);
}

// ---------
// OAuth API

export async function exchangeOAuthCodeForToken({ code }: { code: string }) {
  const res: { token: string; redirect_path: string } = await jsonFetch(
    `${config.apiURI}/dash/oauth/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }
  );
  change(res.token);
  return res;
}

export async function claimTicket({
  ticket,
  token,
}: {
  ticket: string;
  token: string;
}) {
  return jsonMutate(`${config.apiURI}/dash/cli/auth/claim`, {
    token,
    body: { ticket },
  });
}

export async function voidTicket({
  ticket,
  token,
}: {
  ticket: string;
  token: string;
}) {
  return jsonMutate(`${config.apiURI}/dash/cli/auth/void`, {
    token,
    body: { ticket },
  });
}

/**
 * Abstracts over the common pattern of optimistically updating an SWR response during a mutation call
 * Takes an SWR response, a mutation action, and an Immer producer that generates optimistic data
 * It handles:
 * 1. Updating the SWR cache with the optimistic data
 * 2. Revalidating the SWR response after the mutation
 * 3. Rolling back the cache if the mutation fails
 *
 * Context:
 * - https://swr.vercel.app/docs/mutation#optimistic-updates
 * - https://swr.vercel.app/docs/mutation#update-cache-after-mutation
 */
export function optimisticUpdate<T>(
  swrResponse: SWRResponse<T>,
  mutationPromiseToWaitFor: Promise<any>,
  optimisticDataProducer?: (d: Draft<T>) => any
): Promise<T | undefined> {
  return swrResponse.mutate(
    // wait on action, then re-fetch swrResponse
    mutationPromiseToWaitFor,
    {
      // Restore the cache to its previous state if the mutation throws
      rollbackOnError: true,
      // SWR will write the result of the action to the cache by default, which we don't want
      // because our mutation responses aren't the same shape as our query responses
      // https://swr.vercel.app/docs/mutation#update-cache-after-mutation
      populateCache: false,
      // Optimistic update helper with immer
      // https://swr.vercel.app/docs/mutation#optimistic-updates
      optimisticData: (currentValue) => {
        if (currentValue && optimisticDataProducer) {
          return produce(currentValue, optimisticDataProducer);
        }

        return currentValue as T;
      },
    }
  );
}

/**
 * @deprecated Use `claimTicket`
 */
export async function tryCliLogin({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  try {
    const res = await fetch('http://localhost:65432', {
      method: 'POST',
      body: JSON.stringify({ token, email }),
    });

    if (res.ok) {
      const q = new URLSearchParams(window.location.search);

      if (q.has('_cli')) {
        setTimeout(() => {
          close();
        }, 500);
      }
    }
  } catch (error) {}
}
