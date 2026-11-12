// =====================================================================
//  dom.ts — DOM helpers for ui.ts and scene.ts.
// =====================================================================

/** Element by id; throws if the markup in index.html lacks it. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} not found in index.html`);
  }
  return element as T;
}

/** Element by id or null (for elements that exist only on some panes). */
export function maybeById<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/* ---------- iOS home-screen app ---------- */

/** Class on <html> while running as an installed iOS PWA (shows the "station ceiling" strip). */
export const IOS_PWA_CLASS = 'ios-pwa';

/** navigator.standalone exists only in iOS Safari and is true only in a home-screen app. */
export function isIosStandalone(): boolean {
  const navigatorWithStandalone: Navigator & { standalone?: boolean } = navigator;
  return navigatorWithStandalone.standalone === true;
}

/** Called once at startup, before the first render, so the layout does not jump. */
export function markIosPwa(): void {
  document.documentElement.classList.toggle(IOS_PWA_CLASS, isIosStandalone());
}
