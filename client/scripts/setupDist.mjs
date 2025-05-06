import { mkdirSync, writeFileSync } from 'node:fs';

import path from 'node:path';

const distDir = path.resolve('dist');

const make = (sub, type) => {
  const dir = path.join(distDir, sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ type }, null, 2) + '\n',
  );
};

make('cjs', 'commonjs');
make('esm', 'module');

console.log(`📦  Added type markers in ${distDir}/cjs and ${distDir}/esm`);
