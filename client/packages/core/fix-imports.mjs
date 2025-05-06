#!/usr/bin/env node
// fix-imports.mjs
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(process.argv[2] ?? 'src');
const RELATIVE_RE =
  /(\bimport\b(?:\s*\([\s\n]*|[\s\S]*?\bfrom\b\s*)|\bexport\b[\s\S]*?\bfrom\b\s*)(["'])(\.{1,2}\/(?:[^\/"'\n]+\/)*[^\/."'\n]+)\2/g;

/**
 * Walk directory recursively, yielding absolute file paths.
 */
async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(res);
    else if (
      /\.(?:[cm]?js|tsx?)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    )
      yield res;
  }
}

/**
 * Append proper extension to import specifiers lacking one.
 */
function patch(source, ext) {
  return source.replace(RELATIVE_RE, (_, prefix, quote, spec) => {
    return `${prefix}${quote}${spec}${ext}${quote}`;
  });
}

(async () => {
  let touched = 0;

  for await (const file of walk(ROOT)) {
    const original = await fs.readFile(file, 'utf8');
    const extToAdd = path.extname(file) === '.ts' ? '.ts' : '.js';
    const updated = patch(original, extToAdd);

    if (updated !== original) {
      await fs.writeFile(file, updated);
      console.log('• fixed', path.relative(process.cwd(), file));
      touched++;
    }
  }

  console.log(
    touched
      ? `✅  Added explicit extensions in ${touched} file${touched > 1 ? 's' : ''}.`
      : 'ℹ️  No changes needed.',
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
