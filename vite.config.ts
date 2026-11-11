import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the game from https://<user>.github.io/dark-counter/
const BASE = '/dark-counter/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Short hash of the commit being built. Runs at build time (in Node, not in
 * the browser): locally and in GitHub Actions the checkout has .git, so
 * `git rev-parse` works even in a shallow clone. Without git (e.g. a zip
 * download) fall back to GITHUB_SHA, then to "dev".
 */
function commitHash(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
  }
}

export default defineConfig({
  base: BASE,
  // Compile-time constants: Vite replaces these names in the code with the
  // literal values, so the built JS contains e.g. "0.7.0" and "2e58f64".
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
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
