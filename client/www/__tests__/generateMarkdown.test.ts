import { test, expect } from 'vitest';
import { detectRequester } from '../app/getadb/generateMarkdown';

const figmaMakeRequest = new Request('https://www.getadb.com', {
  headers: {
    accept: '*/*',
    'accept-encoding': 'gzip',
    host: 'getadb.com',
    'user-agent': 'curl/7.74.0',
  },
});

const browserRequest = new Request('https://www.getadb.com', {
  headers: {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  },
});

test('detects figma make from the observed curl user-agent', () => {
  expect(detectRequester(figmaMakeRequest)).toBe('figmaMake');
});

test('detects a browser request as unknown', () => {
  expect(detectRequester(browserRequest)).toBe('unknown');
});
