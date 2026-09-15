/**
 * The two editor layouts and the state of the side-by-side columns.
 *
 * `tabs` shows one file at a time behind a tab bar. `columns` shows all three
 * files next to each other, and any column can be collapsed to a narrow strip.
 */
// The explicit extension lets `node --test` load these modules directly, the
// same way `src/state.test.ts` imports them.
import type {PaneId} from './preset-schema.ts';
import {PANE_IDS} from './preset-schema.ts';
import {
  DEFAULTS,
  STORAGE_KEYS,
  readCollapsedPanes,
  readKey,
  writeCollapsedPanes,
  writeKey,
} from './settings.ts';

export {readCollapsedPanes, writeCollapsedPanes};

export type {PaneId};
export {PANE_IDS};

/** How the editors are arranged. */
export type EditorLayout = 'tabs' | 'columns';

/** The query parameter that picks the layout, as in `?editors=columns`. */
export const EDITORS_PARAM = 'editors';

/** The project file and tab label behind each column. */
export const PANE_FILES: Record<PaneId, {file: string; label: string}> = {
  html: {file: 'index.html', label: 'HTML'},
  css: {file: 'styles.css', label: 'CSS'},
  js: {file: 'script.js', label: 'JS'},
};

/** Reads `?editors=` from a query string. Returns `null` when it isn't set. */
export function readLayoutParam(search: string): EditorLayout | null {
  const value = new URLSearchParams(search).get(EDITORS_PARAM);
  return value === 'columns' || value === 'tabs' ? value : null;
}

/** Returns the other layout. */
export function otherLayout(layout: EditorLayout): EditorLayout {
  return layout === 'columns' ? 'tabs' : 'columns';
}

/** Returns the URL with `?editors=` set to the given layout. */
export function layoutUrl(layout: EditorLayout, href: string): string {
  const url = new URL(href);
  url.searchParams.set(EDITORS_PARAM, layout);
  return url.toString();
}

/**
 * Turns a preset's `editors` field into the set of columns to collapse.
 *
 * Every column the preset does not list is collapsed, so a slide that names
 * `["html", "css"]` puts JavaScript out of the way. A preset that leaves the
 * field out returns `null`, which means "keep whatever is on screen".
 */
export function collapsedForPreset(editors: PaneId[] | null): Set<PaneId> | null {
  if (editors === null) {
    return null;
  }
  return new Set(PANE_IDS.filter((pane) => !editors.includes(pane)));
}

/**
 * Picks the layout for this visit: the URL wins, then the remembered choice,
 * then tabs.
 */
export function initialLayout(search: string = window.location.search): EditorLayout {
  const fromUrl = readLayoutParam(search);
  if (fromUrl) {
    return fromUrl;
  }
  const stored = readKey(STORAGE_KEYS.layout);
  if (stored === 'columns' || stored === 'tabs') {
    return stored;
  }
  return DEFAULTS.layout;
}

/** Remembers the layout for the next visit. */
export function writeLayout(layout: EditorLayout): void {
  writeKey(STORAGE_KEYS.layout, layout);
}
