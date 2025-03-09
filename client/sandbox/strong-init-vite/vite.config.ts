import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    port: 3015,
  },
});
