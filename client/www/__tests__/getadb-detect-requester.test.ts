import { test, expect } from 'vitest';
import { detectRequester } from '../app/getadb/detect-requester';

test('detects figmaMake from curl/7.74.0 user-agent', () => {
  const request = new Request('https://instant.ngrok.dev/getadb', {
    headers: {
      accept: '*/*',
      'accept-encoding': 'gzip',
      host: 'instant.ngrok.dev',
      'user-agent': 'curl/7.74.0',
      'x-forwarded-for': '104.28.162.252',
      'x-forwarded-host': 'instant.ngrok.dev',
      'x-forwarded-port': '3000',
      'x-forwarded-proto': 'https',
    },
  });

  expect(detectRequester(request)).toBe('figmaMake');
});

test('returns unknown for a real browser request', () => {
  const request = new Request('https://instant.ngrok.dev/getadb', {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
  });

  expect(detectRequester(request)).toBe('unknown');
});

test('returns unknown for a different curl version', () => {
  const request = new Request('https://instant.ngrok.dev/getadb', {
    headers: { 'user-agent': 'curl/8.4.0' },
  });

  expect(detectRequester(request)).toBe('unknown');
});

test('returns unknown when user-agent is missing', () => {
  const request = new Request('https://instant.ngrok.dev/getadb');
  expect(detectRequester(request)).toBe('unknown');
});
