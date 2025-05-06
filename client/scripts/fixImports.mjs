#!/usr/bin/env node

import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

/*  Capture groups:
    1 → leading “import … from ” / “export … from ” / “import(”
    2 → the opening quote character (' or ")
    3 → the specifier (./foo/bar)
    (we rely on \2 in the regex to ensure it already ends with the same quote)
*/
const RELATIVE_RE =
  /(\bimport\b\s*\(\s*|\bimport\b[\s\S]*?\bfrom\b\s*|\bexport\b[\s\S]*?\bfrom\b\s*)(["'])(\.{1,2}\/[^"' \n]+?)\2/g;

const EXT_ORDER = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const ROOT = path.resolve(process.argv[2] ?? 'src');

async function* walk(dir) {
  for (const d of await fsp.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(res);
    else if (/\.(?:[cm]?js|tsx?)$/.test(d.name) && !d.name.endsWith('.d.ts'))
      yield res;
  }
}

function findExt(absBase) {
  for (const ext of EXT_ORDER) {
    if (fs.existsSync(absBase + ext)) return ext;
  }
  for (const ext of EXT_ORDER) {
    // ./dir -> ./dir/index.ts
    if (fs.existsSync(path.join(absBase, `index${ext}`))) return `/index${ext}`;
  }
  return null;
}

async function fix(file) {
  const original = await fsp.readFile(file, 'utf8');
  let changed = false;

  const updated = original.replace(RELATIVE_RE, (_, lead, quote, spec) => {
    if (path.extname(spec)) return _; // already explicit

    const absBase = path.resolve(path.dirname(file), spec);
    const ext = findExt(absBase);
    if (!ext) return _; // nothing to add

    changed = true;
    return `${lead}${quote}${spec}${ext}${quote}`;
  });

  if (changed) {
    await fsp.writeFile(file, updated);
    console.log('• fixed', path.relative(process.cwd(), file));
  }
  return changed;
}

(async () => {
  let total = 0;
  for await (const f of walk(ROOT)) if (await fix(f)) total++;
  console.log(
    total
      ? `✅  Explicit extensions added in ${total} file${total > 1 ? 's' : ''}.`
      : 'ℹ️  No changes were necessary.',
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
