// Base64 decode, switching to url-safe decode if we hit an error
// Can't be sure which method Clerk uses because you can't generate
// `+` or `/` with characters that go in a normal host. Urls with
// chinese characters exist, they might encode to `+` or `/`, and
// Clerk might support them, so we'll be safe and do both.
function base64Decode(s: string) {
  try {
    return Buffer.from(s, 'base64').toString('utf-8');
  } catch (e) {
    return Buffer.from(s, 'base64url').toString('utf-8');
  }
}

export function clerkDomainFromPublishableKey(key: string): string | null {
  try {
    const parts = key.split('_');
    const domainPartB64 = parts[parts.length - 1];
    const domainPart = base64Decode(domainPartB64);
    return domainPart.replace('$', '');
  } catch (e) {
    console.error('Error getting domain from clerk key', e);
    return null;
  }
}
