/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Version from package.json, injected at build time (see `define` in vite.config.ts). */
declare const __APP_VERSION__: string;
/** Short git commit hash of the build, injected at build time. */
declare const __COMMIT_HASH__: string;
