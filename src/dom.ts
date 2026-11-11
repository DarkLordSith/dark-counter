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
