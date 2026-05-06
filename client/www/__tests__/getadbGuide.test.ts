import { test, expect } from 'vitest';
import { GUIDE_MARKDOWN } from '../app/getadb/guideMarkdown';

test('guide markdown points agents at the provision URL', () => {
  expect(GUIDE_MARKDOWN).toContain('https://getadb.com/provision/');
});

test('guide markdown asks for a UUID, not a 16-char token', () => {
  expect(GUIDE_MARKDOWN.toLowerCase()).toContain('uuid');
  expect(GUIDE_MARKDOWN).not.toContain('16-char');
  expect(GUIDE_MARKDOWN).not.toContain('alphanumeric');
});
