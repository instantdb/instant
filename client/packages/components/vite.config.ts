import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import dts from 'unplugin-dts/vite';

import { peerDependencies, dependencies } from './package.json';

export default defineConfig({
  clearScreen: false,
  plugins: [react({}), tailwindcss({ optimize: true }), dts({})],
  resolve: {
    alias: {
      '@lib': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    emptyOutDir: false,
    cssCodeSplit: true,
    lib: {
      formats: ['es', 'cjs'],
      entry: [
        resolve(__dirname, 'src', 'index.tsx'),
        resolve(__dirname, 'src', 'style.css'),
      ],
      // @ts-ignore, currently not functional
      // if styling solution beyond shadow dom necessary this will have to be fixed
      cssFileName: 'style',
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) => {
        // Bundle prism-react-renderer to avoid CJS/ESM interop issues
        if (
          id === 'prism-react-renderer' ||
          id.startsWith('prism-react-renderer/')
        ) {
          return false;
        }
        // Check exact matches and subpath imports (e.g., react/jsx-runtime)
        const allDeps = [
          ...Object.keys(peerDependencies),
          ...Object.keys(dependencies),
        ];
        return allDeps.some((dep) => id === dep || id.startsWith(dep + '/'));
      },
    },
  },
});
