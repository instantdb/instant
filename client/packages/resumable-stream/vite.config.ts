import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  clearScreen: false,
  build: {
    outDir: 'dist/standalone',
    lib: {
      formats: ['umd', 'es'],
      // this is the file that exports our components
      entry: resolve(__dirname, 'src', 'index.ts'),
      name: 'instant',
      fileName: 'index',
    },
  },
  define: {
    'process.env': {},
  },
});
