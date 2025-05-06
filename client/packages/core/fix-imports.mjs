#!/usr/bin/env node
// fix-imports.mjs
//--------------------------------------------
// Make all relative imports/export specifiers
// in *.js/ts/tsx/jsx/mjs/cjs explicit by
// adding the real on-disk extension.
//--------------------------------------------
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

/*
  Regex notes
  -----------
  – Captures     1: everything up to the opening quote
                 2: the opening quote  (" or ')
                 3: the specifier      ./foo/bar
  – Ensures we only touch import/export/require-like code,
    not arbitrary strings.
*/
const RELATIVE_RE =
  /((?:\bimport\b\s*\(\s*|\bimport\b[\s\S]*?\bfrom\b\s*|\bexport\b[\s\S]*?\bfrom\b\s*)["'])(\.{1,2}\/[^"'\s]+?)["']/g;

const EXT_ORDER = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const ROOT = path.resolve(process.argv[2] ?? 'src');

async function* walk(dir) {
  for (const dirent of await fsp.readdir(dir, { withFileTypes: true })) {
    const res = path.join(dir, dirent.name);
    if (dirent.isDirectory()) yield* walk(res);
    else if (
      /\.(?:[cm]?js|tsx?)$/.test(dirent.name) &&
      !dirent.name.endsWith('.d.ts')
    )
      yield res;
  }
}

/**
 * Pick the first existing extension for spec
 */
function findExistingExt(specAbsBase) {
  for (const ext of EXT_ORDER) {
    if (fs.existsSync(specAbsBase + ext)) return ext;
  }
  // Support `index.*`
  for (const ext of EXT_ORDER) {
    if (fs.existsSync(path.join(specAbsBase, `index${ext}`)))
      return `/index${ext}`;
  }
  return null;
}

async function fixFile(file) {
  const original = await fsp.readFile(file, 'utf8');
  let changed = false;

  const updated = original.replace(RELATIVE_RE, (whole, prefix, specRel) => {
    if (path.extname(specRel)) return whole; // already explicit

    const importerDir = path.dirname(file);
    const absBase = path.resolve(importerDir, specRel); // no ext
    const ext = findExistingExt(absBase);

    if (!ext) return whole; // nothing found

    changed = true;
    return `${prefix}${specRel}${ext}"`;
  });

  if (changed) {
    await fsp.writeFile(file, updated);
    console.log('• fixed', path.relative(process.cwd(), file));
  }
  return changed;
}

(async () => {
  let total = 0;
  for await (const file of walk(ROOT)) {
    if (await fixFile(file)) total++;
  }
  console.log(
    total
      ? `✅  Explicit extensions added in ${total} file${total > 1 ? 's' : ''}.`
      : 'ℹ️  No changes were necessary.',
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
