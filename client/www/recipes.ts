import fs from 'fs';
import { capitalize } from 'lodash';

export type File = {
  code: string;
  name: string;
  fileName: string;
  pathName: string;
};

export function getFiles(): File[] {
  return fs
    .readdirSync('./lib/recipes')
    .filter((f) => f.match(/^\d.*\.tsx$/))
    .map((fileName) => {
      const pathName = fileName.replace(/\.tsx$/, '');
      const name = capitalize(pathName.slice(2).split('-').join(' '));
      const displayFileName = name.split(' ').map(capitalize).join('') + '.tsx';
      const raw = fs.readFileSync(`./lib/recipes/${fileName}`, 'utf-8');
      const code = processCode(raw).trimEnd();

      return { fileName: displayFileName, pathName, name, code };
    });
}

function processCode(raw: string): string {
  let inHideBlock = false;
  const processed = raw
    .split('\n')
    .reduce((acc: string[], line: string) => {
      const trimmed = line.trim();

      if (trimmed === '// hide-start') {
        inHideBlock = true;
        return acc;
      }
      if (trimmed === '// hide-end') {
        inHideBlock = false;
        return acc;
      }
      if (inHideBlock) return acc;
      if (line.indexOf('// hide-line') !== -1) return acc;

      // // show: <text> → include <text> as a real line
      const showMatch = line.match(/^(\s*)\/\/ show: ?(.*)/);
      if (showMatch) {
        acc.push(showMatch[1] + showMatch[2]);
        return acc;
      }

      // {/* show: <text> */} → include <text> as a real line (JSX comment variant)
      const jsxShowMatch = line.match(/^(\s*)\{\/\*\s*show:\s*(.*?)\s*\*\/\}$/);
      if (jsxShowMatch) {
        acc.push(jsxShowMatch[1] + jsxShowMatch[2]);
        return acc;
      }

      acc.push(line);
      return acc;
    }, [])
    .join('\n');

  return autoTransform(processed);
}

/**
 * Auto-transforms recipe code for display:
 * 1. Strips `import type { ... } from './types'` lines
 * 2. Adds `init` to the @instantdb/react import (or creates one)
 * 3. Inserts `const db = init(...)` after imports
 * 4. Rewrites `export default function Foo({ db }: RecipeProps)` → `Foo()`
 */
function autoTransform(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  let lastImportIndex = -1;
  let hasInstantImport = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Strip imports from './types' and './db' (internal recipe infrastructure)
    if (trimmed.match(/^import\s+.*from\s+['"]\.\/(types|db)['"]/)) {
      continue;
    }

    // Strip `const db = useRecipeDB();` lines
    if (trimmed === 'const db = useRecipeDB();') {
      continue;
    }

    // Add `init` to @instantdb/react import
    if (trimmed.match(/^import\s+\{.*\}\s+from\s+['"]@instantdb\/react['"]/)) {
      hasInstantImport = true;
      const replaced = line.replace(
        /import\s+\{([^}]+)\}\s+from\s+(['"]@instantdb\/react['"])/,
        (match, imports, from) => {
          const names = imports
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (!names.includes('init')) {
            names.push('init');
            names.sort();
          }
          return `import { ${names.join(', ')} } from ${from}`;
        },
      );
      result.push(replaced);
      lastImportIndex = result.length - 1;
      continue;
    }

    // Track last import line
    if (trimmed.startsWith('import ')) {
      result.push(line);
      lastImportIndex = result.length - 1;
      continue;
    }

    result.push(line);
  }

  // If no @instantdb/react import was found, add one
  if (!hasInstantImport && lastImportIndex >= 0) {
    result.splice(
      lastImportIndex + 1,
      0,
      `import { init } from '@instantdb/react';`,
    );
    lastImportIndex++;
  }

  // Insert init block after last import
  if (lastImportIndex >= 0) {
    const initBlock = [
      '',
      'const db = init({',
      '  appId: "__YOUR_APP_ID__",',
      '});',
    ];
    result.splice(lastImportIndex + 1, 0, ...initBlock);
  }

  return result.join('\n');
}
