// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  devServer: {
    port: 3060,
  },
  telemetry: false,
  vite: {
    clearScreen: false,
    logLevel: 'warn',
  },
});
