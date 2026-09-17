/**
 * Which view a URL asks for, and when a history move needs a fresh boot.
 *
 * The router runs once at start-up, so going back or forward between views has
 * to be turned into a reload. These helpers are pure so `src/route.test.ts`
 * can cover the rule without a browser.
 */

/** The three views the playground can show. */
export type Route =
  | {kind: 'home'}
  | {kind: 'deck'; id: string}
  | {kind: 'scratch'};

/**
 * Decides between the home page and the editor.
 *
 * A deck id opens that deck. A `#code=` or `#preset=` hash without a deck id
 * opens the scratch pad, which is what a shared link and the CLI produce.
 * Anything else lands on the home page.
 */
export function routeFor(search: string, hash: string): Route {
  const deck = new URLSearchParams(search).get('deck');
  if (deck) {
    return {kind: 'deck', id: deck};
  }
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value.startsWith('code=') || value.startsWith('preset=')) {
    return {kind: 'scratch'};
  }
  return {kind: 'home'};
}

/** Reports whether two routes show the same view of the same deck. */
export function sameRoute(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind === 'deck' && b.kind === 'deck' ? a.id === b.id : true;
}

/**
 * Reports whether a history move has to reload the page.
 *
 * Moving within one deck only changes the slide, which the app handles in
 * place. Everything else changes which view is mounted.
 */
export function needsReboot(from: Route, to: Route): boolean {
  return !sameRoute(from, to);
}

/** Returns the slide id a URL names, or `null`. */
export function slideIdFromHash(hash: string): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value.startsWith('preset=')) {
    return null;
  }
  const id = decodeURIComponent(value.slice('preset='.length));
  return id || null;
}
