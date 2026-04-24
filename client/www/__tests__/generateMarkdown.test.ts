import { test, expect } from 'vitest';
import generateMarkdown, {
  detectRequester,
} from '../app/getadb/generateMarkdown';

const figmaMakeRequest = new Request('https://getadb.com/getadb', {
  headers: {
    accept: '*/*',
    'accept-encoding': 'gzip',
    host: 'getadb.com',
    'user-agent': 'curl/7.74.0',
  },
});

const browserRequest = new Request('https://getadb.com/getadb', {
  headers: {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  },
});

const app = {
  id: 'test-app-id',
  adminToken: 'test-admin-token',
};

test('detects figma make from the observed curl user-agent', () => {
  expect(detectRequester(figmaMakeRequest)).toBe('figmaMake');
});

test('detects a browser request as unknown', () => {
  expect(detectRequester(browserRequest)).toBe('unknown');
});

test('does not detect other curl versions as figma make', () => {
  const request = new Request('https://getadb.com/getadb', {
    headers: { 'user-agent': 'curl/8.4.0' },
  });

  expect(detectRequester(request)).toBe('unknown');
});

test('adds extra rules for figma make', async () => {
  const markdown = await generateMarkdown(figmaMakeRequest, app);

  expect(markdown).toContain('VITE_INSTANT_APP_ID=test-app-id');
  expect(markdown).toContain('INSTANT_ADMIN_TOKEN=test-admin-token');
  expect(markdown).toContain('Additional rules for Figma Make:');
  expect(markdown).toContain('Do not use the Supabase skill.');
});

test('does not add figma make rules for browser requests', async () => {
  const markdown = await generateMarkdown(browserRequest, app);

  expect(markdown).not.toContain('Additional rules for Figma Make:');
});
