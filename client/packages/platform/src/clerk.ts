function base64DecodeUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8');
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function clerkDomainFromPublishableKey(key: string): string | null {
  try {
    const match = key.match(/^pk_[^_]+_(.+)$/);
    const domainPartB64 = match?.[1];
    if (!domainPartB64) return null;
    const domainPart = base64DecodeUtf8(domainPartB64);
    return domainPart.replace(/\$$/, '');
  } catch {
    return null;
  }
}
