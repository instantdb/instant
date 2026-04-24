export type Requester = 'figmaMake' | 'unknown';

export function detectRequester(request: Request): Requester {
  const userAgent = request.headers.get('user-agent') ?? '';
  if (userAgent === 'curl/7.74.0') return 'figmaMake';
  return 'unknown';
}
