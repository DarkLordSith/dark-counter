import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the game from https://<user>.github.io/dark-counter/
const BASE = '/dark-counter/';

export default defineConfig({
  base: BASE,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // the old hand-written worker was /dark-counter/sw.js — same URL, so
      // installed copies update to this one instead of keeping two workers
      filename: 'sw.js',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Тёмный прилавок',
        short_name: 'Прилавок',
        description: 'Пиксельный киберпанк-симулятор лавки на космической станции.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1220',
        theme_color: '#0f1220',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        // Google Fonts: serve from cache, refresh in background (as the old sw.js did)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /fonts\.(googleapis|gstatic)\.com$/.test(url.host),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
