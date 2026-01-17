// https://tools.ietf.org/html/rfc7636#section-4.1
export function pkceVerifier(): string {
  const chars =
    '0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz-._~';
  let s = '';

  for (const value of crypto.getRandomValues(new Uint8Array(64))) {
    s = s + chars[value % chars.length];
  }

  return s;
}

export function sha256(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest({ name: 'SHA-256' }, new TextEncoder().encode(s));
}

function urlSafeBase64(s: string): string {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function pkceCodeChallengeOfVerifier(verifier: string): Promise<string> {
  return sha256(verifier).then((s) => {
    return urlSafeBase64(
      btoa(String.fromCharCode(...Array.from(new Uint8Array(s)))),
    );
  });
}
