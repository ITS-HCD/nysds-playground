/**
 * Every playground setting and the one place that touches `localStorage`.
 *
 * Each setting can also come from the URL, so a link can open the playground
 * configured a particular way. The URL wins over the remembered value, and the
 * remembered value wins over the default.
 *
 * The parsing and clamping here are pure, so `src/state.test.ts` exercises them
 * without a DOM. Only the `read*`/`write*` helpers touch storage, and every one
 * of them tolerates storage being blocked.
 */
import type {EditorLayout} from './editors.ts';
import type {PaneId} from './preset-schema.ts';
import {PANE_IDS} from './preset-schema.ts';
import type {EditorTheme} from './theme.ts';

/** The code font sizes the settings modal offers. */
export type FontSize = 'small' | 'medium' | 'large';

/** How soon an edit reaches the preview. */
export type UpdateMode = 'typing' | 'pause' | 'manual';

/** The pixel size each font choice maps to. */
export const FONT_SIZES: Record<FontSize, string> = {
  small: '13px',
  medium: '15px',
  large: '18px',
};

/**
 * How long the playground waits for typing to stop before it rebuilds, in
 * milliseconds. `manual` never rebuilds on its own.
 */
export const UPDATE_DELAYS: Record<UpdateMode, number | null> = {
  typing: 800,
  pause: 2000,
  manual: null,
};

/** The defaults a fresh visit, and "Reset settings", start from. */
export const DEFAULTS = {
  theme: 'light' as EditorTheme,
  layout: 'tabs' as EditorLayout,
  fontSize: 'medium' as FontSize,
  updateMode: 'typing' as UpdateMode,
  prereleases: false,
  splitRatio: 50,
  presentEditorSize: 32,
};

/** Every key the playground writes, so "Reset settings" can clear them all. */
export const STORAGE_KEYS = {
  theme: 'nysds-playground:editor-theme',
  layout: 'nysds-playground:editor-layout',
  fontSize: 'nysds-playground:font-size',
  updateMode: 'nysds-playground:update-mode',
  prereleases: 'nysds-playground:prereleases',
  collapsedPanes: 'nysds-playground:collapsed-panes',
  splitRatio: 'nysds-playground:split-ratio',
  presentEditorSize: 'nysds-playground:present-editor-size',
  presentCodeCollapsed: 'nysds-playground:present-code-collapsed',
} as const;

/* URL parsing ----------------------------------------------------------- */

/** Reads `?font=`. Returns `null` when it is absent or unrecognised. */
export function readFontParam(search: string): FontSize | null {
  const value = new URLSearchParams(search).get('font');
  return value === 'small' || value === 'medium' || value === 'large' ? value : null;
}

/** Reads `?update=`. Returns `null` when it is absent or unrecognised. */
export function readUpdateParam(search: string): UpdateMode | null {
  const value = new URLSearchParams(search).get('update');
  return value === 'typing' || value === 'pause' || value === 'manual' ? value : null;
}

/** Keeps a pane ratio inside the range the layout can actually render. */
export function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/* Storage --------------------------------------------------------------- */

/** Reads one key, returning `null` when storage is unavailable or empty. */
export function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes one key, ignoring storage that refuses to take it. */
export function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing can block storage. The setting still applies this visit.
  }
}

/** Picks a setting: the URL first, then storage, then the default. */
function choose<T extends string>(
  fromUrl: T | null,
  key: string,
  valid: readonly T[],
  fallback: T,
): T {
  if (fromUrl) {
    return fromUrl;
  }
  const stored = readKey(key);
  return valid.includes(stored as T) ? (stored as T) : fallback;
}

/** The code font size for this visit. */
export function initialFontSize(search: string = window.location.search): FontSize {
  return choose(
    readFontParam(search),
    STORAGE_KEYS.fontSize,
    ['small', 'medium', 'large'],
    DEFAULTS.fontSize,
  );
}

/** The preview update mode for this visit. */
export function initialUpdateMode(search: string = window.location.search): UpdateMode {
  return choose(
    readUpdateParam(search),
    STORAGE_KEYS.updateMode,
    ['typing', 'pause', 'manual'],
    DEFAULTS.updateMode,
  );
}

/** Whether the version menu lists prereleases. */
export function readPrereleases(): boolean {
  const stored = readKey(STORAGE_KEYS.prereleases);
  return stored === null ? DEFAULTS.prereleases : stored === '1';
}

/** Remembers whether the version menu lists prereleases. */
export function writePrereleases(on: boolean): void {
  writeKey(STORAGE_KEYS.prereleases, on ? '1' : '0');
}

/** Reads a remembered pane ratio, clamped to the range the layout allows. */
export function readRatio(key: string, fallback: number, min: number, max: number): number {
  const raw = readKey(key);
  if (raw === null) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? clampRatio(parsed, min, max) : fallback;
}

/** Remembers a pane ratio. */
export function writeRatio(key: string, ratio: number): void {
  writeKey(key, ratio.toFixed(2));
}

/** Reads the collapsed editor columns. */
export function readCollapsedPanes(): Set<PaneId> {
  const raw = readKey(STORAGE_KEYS.collapsedPanes);
  if (!raw) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((pane): pane is PaneId => (PANE_IDS as readonly unknown[]).includes(pane)),
    );
  } catch {
    return new Set();
  }
}

/** Remembers the collapsed editor columns. */
export function writeCollapsedPanes(collapsed: ReadonlySet<PaneId>): void {
  writeKey(STORAGE_KEYS.collapsedPanes, JSON.stringify([...collapsed]));
}

/** Clears every playground key, so the next read falls back to the defaults. */
export function clearAllSettings(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do when storage refuses.
    }
  }
}

/** Applies a code font size to the editors. */
export function applyFontSize(size: FontSize): void {
  // The dark theme block also sets this property on `body`, so an inline style
  // on `body` is what reliably wins.
  document.body.style.setProperty('--playground-code-font-size', FONT_SIZES[size]);
}

/** Returns the URL with a setting's query parameter set. */
export function settingUrl(name: string, value: string, href: string): string {
  const url = new URL(href);
  url.searchParams.set(name, value);
  return url.toString();
}
