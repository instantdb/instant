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
    // TODO: make this true for prod
    emptyOutDir: false,
    lib: {
      formats: ['es'],
      entry: resolve(__dirname, 'src', 'index.tsx'),
      // @ts-ignore, currently not functional
      // if styling solution beyond shadow dom necessary this will have to be fixed
      cssFileName: 'style',
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) => {
        // Check exact matches and subpath imports (e.g., react/jsx-runtime)
        const allDeps = [
          ...Object.keys(peerDependencies),
          ...Object.keys(dependencies),
        ];
        return allDeps.some((dep) => id === dep || id.startsWith(dep + '/'));
      },
      // external: [
      //   'react',
      //   'react/jsx-runtime',
      //   '@heroicons/react',
      //   ...Object.keys(peerDependencies),
      //   ...Object.keys(dependencies),
      // ],
    },
  },
});
