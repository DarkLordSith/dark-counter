import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cssRootRule, THEME_COLOR } from './src/palette.ts';

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

/**
 * Colors live only in src/palette.ts. This plugin puts them into index.html
 * (dev server and build alike) as an inline `<style>:root{--bg:…}</style>` in
 * <head>: it is there before anything renders (no flash of default colors)
 * and the precached index.html carries it offline. Also <meta name="theme-color">.
 * In dev an edit of palette.ts reloads the page.
 */
function paletteCss(): Plugin {
  return {
    name: 'dark-counter:palette-css',
    transformIndexHtml() {
      return [
        { tag: 'style', attrs: { id: 'palette' }, children: cssRootRule(), injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: THEME_COLOR }, injectTo: 'head' },
      ];
    },
    // The <style> is baked into the HTML, so HMR cannot swap it: after an edit
    // of palette.ts reload the whole page (dev only).
    hotUpdate({ file }) {
      if (this.environment.name === 'client' && file.endsWith('/src/palette.ts')) {
        this.environment.hot.send({ type: 'full-reload' });
        return [];
      }
    },
  };
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
    paletteCss(),
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
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
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
    // Vitest stubs CSS imports by default, so `style.css?raw` came back empty.
    // Process style.css so the palette / meaning tests read the real file.
    css: { include: [/style\.css/] },
  },
});
