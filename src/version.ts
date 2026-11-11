// =====================================================================
//  version.ts — build version shown in the save menu: "v0.7 · 2e58f64".
//  __APP_VERSION__ and __COMMIT_HASH__ are replaced by Vite at build
//  time (see `define` in vite.config.ts).
// =====================================================================

/** "0.7.0" + "2e58f64" → "v0.7 · 2e58f64"; a non-zero patch is kept: "v0.7.1 · …". */
export function versionLabel(version: string, commit: string): string {
  return `v${version.replace(/\.0$/, '')} · ${commit}`;
}

export const VERSION_LABEL = versionLabel(__APP_VERSION__, __COMMIT_HASH__);
