import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        cli: resolve(__dirname, 'src/cli.ts'),
        InstantVueDatabase: resolve(__dirname, 'src/InstantVueDatabase.ts'),
        InstantVueRoom: resolve(__dirname, 'src/InstantVueRoom.ts'),
        useInfiniteQuery: resolve(__dirname, 'src/useInfiniteQuery.ts'),
        utils: resolve(__dirname, 'src/utils.ts'),
        version: resolve(__dirname, 'src/version.ts'),
        'components/SignedIn': resolve(
          __dirname,
          'src/components/SignedIn.vue',
        ),
        'components/SignedOut': resolve(
          __dirname,
          'src/components/SignedOut.vue',
        ),
        'components/Cursor': resolve(__dirname, 'src/components/Cursor.vue'),
        'components/Cursors': resolve(__dirname, 'src/components/Cursors.vue'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', '@instantdb/core', '@instantdb/version'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.ts'],
  },
});
