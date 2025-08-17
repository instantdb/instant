import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Copy Reactor.js and Reactor.d.ts to both ESM and CommonJS outputs
const files = ['Reactor.js', 'Reactor.d.ts'];
const targets = ['dist/esm', 'dist/commonjs'];

for (const target of targets) {
  for (const file of files) {
    const src = join(rootDir, 'src', file);
    const dest = join(rootDir, target, file);
    
    try {
      copyFileSync(src, dest);
      console.log(`Copied ${file} to ${target}`);
    } catch (err) {
      console.error(`Failed to copy ${file} to ${target}:`, err.message);
    }
  }
}