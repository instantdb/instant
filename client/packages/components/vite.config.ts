import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

import { peerDependencies } from './package.json';

export default defineConfig({
  clearScreen: false,
  plugins: [
    react({}),
    tailwindcss({ optimize: true }),
    dts({ rollupTypes: false, tsconfigPath: './tsconfig.json' }),
  ],
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: true,
    lib: {
      formats: ['es', 'cjs'],
      entry: resolve(__dirname, 'lib', 'index.tsx'),
      // @ts-ignore
      cssFileName: 'style',
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        ...Object.keys(peerDependencies),
      ],
    },
  },
});
