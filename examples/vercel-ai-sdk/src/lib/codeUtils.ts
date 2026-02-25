import type { UIMessage } from 'ai';

export function extractText(msg: UIMessage): string {
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
    .trim();
}

export function stripMarkdownFences(text: string): string {
  let t = text.trim();
  const startFenceMatch = t.match(/^[\s\S]*?```[a-zA-Z0-9_-]*\n?/);
  if (startFenceMatch) {
    t = t.slice(startFenceMatch[0].length);
  } else if (t.includes('```')) {
    t = t.slice(t.indexOf('```') + 3);
  }

  const endFenceIdx = t.lastIndexOf('```');
  if (endFenceIdx !== -1) {
    t = t.slice(0, endFenceIdx);
  }

  return t.trim();
}

export function sanitizeForExecution(code: string): string {
  let clean = code.trim();
  const importIdx = clean.indexOf('import ');
  if (importIdx > 0) clean = clean.slice(importIdx);
  const exports = [...clean.matchAll(/export\s+default\s+[A-Za-z0-9_]+\s*;?/g)];
  const last = exports.at(-1);
  if (last?.index !== undefined)
    clean = clean.slice(0, last.index + last[0].length);
  return clean.trim();
}

export function getLatestAssistantCode(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    const text = extractText(messages[i]);
    return stripMarkdownFences(text);
  }
  return '';
}
