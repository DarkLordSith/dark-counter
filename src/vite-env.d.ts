/// <reference types="vite/client" />

/** Version from package.json, injected at build time (see `define` in vite.config.ts). */
declare const __APP_VERSION__: string;
/** Short git commit hash of the build, injected at build time. */
declare const __COMMIT_HASH__: string;
