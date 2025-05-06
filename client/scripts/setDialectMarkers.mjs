import fs from 'node:fs';
import path from 'node:path';

const pairs = process.argv.slice(2);

if (pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error(
    '\n  Usage: node setDialectMarkers <dir> <type> [<dir> <type> …]\n' +
      '  Example: node setDialectMarkers dist/esm module dist/cjs commonjs\n',
  );
  process.exit(1);
}

for (let i = 0; i < pairs.length; i += 2) {
  const dir = path.resolve(pairs[i]);
  const type = pairs[i + 1];

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ type }, null, 2) + '\n',
  );

  console.log(
    `✅  ${path.relative(process.cwd(), dir)}/package.json → { "type": "${type}" }`,
  );
}
