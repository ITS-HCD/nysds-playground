/**
 * Reads and writes the playground state in the URL.
 *
 * Two hash forms exist. `#code=` carries a compressed snapshot of the editors
 * and is what a Share link produces. `#preset=` carries a preset id and stays
 * readable, so it is used while a preset is loaded and unmodified.
 */
// lz-string ships CommonJS, so import the namespace as a default and read the
// two functions off it. Named imports do not survive Node's CJS interop.
import LZString from 'lz-string';

const {compressToEncodedURIComponent, decompressFromEncodedURIComponent} = LZString;

/** Everything the playground needs to restore a session. */
export interface PlaygroundState {
  /** The design system version the preview loads. */
  version: string;
  /** The user's HTML. */
  html: string;
  /** The user's CSS. */
  css: string;
  /** The user's JavaScript. */
  js: string;
}

/** The compact object that goes into the hash. Short keys keep links short. */
interface EncodedState {
  v: string;
  h: string;
  c: string;
  j: string;
}

/** What the current URL asks the playground to load. */
export type LocationState =
  | {kind: 'code'; state: PlaygroundState}
  | {kind: 'preset'; id: string}
  | {kind: 'default'};

/** The query parameter that turns on presentation mode. */
const PRESENT_PARAM = 'present';

/** The query parameter that selects a deck. */
const DECK_PARAM = 'deck';

/** Compresses a state snapshot into the value of a `#code=` hash. */
export function encodeState(state: PlaygroundState): string {
  const payload: EncodedState = {
    v: state.version,
    h: state.html,
    c: state.css,
    j: state.js,
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Expands a `#code=` hash value. Returns `null` when the value is unusable. */
export function decodeState(encoded: string): PlaygroundState | null {
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(encoded);
  } catch {
    return null;
  }
  if (!json) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Partial<EncodedState>;
  if (
    typeof candidate.v !== 'string' ||
    typeof candidate.h !== 'string' ||
    typeof candidate.c !== 'string' ||
    typeof candidate.j !== 'string'
  ) {
    return null;
  }
  return {version: candidate.v, html: candidate.h, css: candidate.c, js: candidate.j};
}

/** Parses a hash string such as `#code=abc` into a {@link LocationState}. */
export function parseHash(hash: string): LocationState {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value.startsWith('code=')) {
    const state = decodeState(value.slice('code='.length));
    if (state) {
      return {kind: 'code', state};
    }
    return {kind: 'default'};
  }
  if (value.startsWith('preset=')) {
    const id = decodeURIComponent(value.slice('preset='.length));
    if (id) {
      return {kind: 'preset', id};
    }
  }
  return {kind: 'default'};
}

/** Reads the current browser location. */
export function readLocation(): LocationState {
  return parseHash(window.location.hash);
}

/**
 * Returns the deck id the URL asks for, or `null` for the library deck.
 */
export function readDeckId(search: string = window.location.search): string | null {
  return new URLSearchParams(search).get(DECK_PARAM);
}

/**
 * Builds a URL for a deck and slide, keeping presentation mode.
 *
 * The library deck drops the `deck` parameter so its links stay short.
 */
export function deckUrl(
  deckId: string,
  presetId: string,
  libraryDeckId: string,
  href: string = window.location.href,
): string {
  const url = new URL(href);
  if (deckId === libraryDeckId) {
    url.searchParams.delete(DECK_PARAM);
  } else {
    url.searchParams.set(DECK_PARAM, deckId);
  }
  url.hash = presetId ? `#preset=${encodeURIComponent(presetId)}` : '';
  return url.toString();
}

/** Reports whether the current URL requests presentation mode. */
export function isPresentMode(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get(PRESENT_PARAM) === '1';
}

/**
 * Returns the current URL with presentation mode turned on or off.
 *
 * The hash is preserved, so leaving presentation mode keeps you on the preset
 * you were showing.
 */
export function presentUrl(on: boolean, href: string = window.location.href): string {
  const url = new URL(href);
  if (on) {
    url.searchParams.set(PRESENT_PARAM, '1');
  } else {
    url.searchParams.delete(PRESENT_PARAM);
  }
  return url.toString();
}

/**
 * Replaces the hash without adding a history entry.
 *
 * Query parameters stay untouched so `?present=1` survives every update.
 */
export function replaceHash(hash: string): void {
  const url = new URL(window.location.href);
  url.hash = hash;
  window.history.replaceState(null, '', url.toString());
}

/** Writes a `#code=` hash for the given state. */
export function writeCodeHash(state: PlaygroundState): void {
  replaceHash(`#code=${encodeState(state)}`);
}

/** Writes a `#preset=` hash for the given preset id. */
export function writePresetHash(id: string): void {
  replaceHash(`#preset=${encodeURIComponent(id)}`);
}

/**
 * Returns a function that runs `fn` after `delay` milliseconds of quiet.
 *
 * The playground uses it to keep edits from writing to the URL on every
 * keystroke.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): {(...args: T): void; flush(): void; cancel(): void} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;
  const run = (...args: T): void => {
    pending = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const args = pending;
      pending = undefined;
      if (args) {
        fn(...args);
      }
    }, delay);
  };
  run.flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const args = pending;
    pending = undefined;
    if (args) {
      fn(...args);
    }
  };
  run.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending = undefined;
  };
  return run;
}

/** Turns a title into a filename-safe slug. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'playground';
}
