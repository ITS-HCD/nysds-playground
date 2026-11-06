/**
 * Light and dark editor themes.
 *
 * The preview always shows the design system as it is. Only the code editors
 * change. Dark is the default (`DEFAULTS.theme` in `src/settings.ts`): a dark
 * pane frames the light preview, which suits screen recordings. Light suits
 * projectors, which wash out dark backgrounds.
 */
import lightTheme from 'playground-elements/themes/eclipse.css.js';
import darkTheme from 'playground-elements/themes/material-darker.css.js';

import {DEFAULTS, STORAGE_KEYS, readKey, writeKey} from './settings.ts';

/** The two editor themes the playground offers. */
export type EditorTheme = 'light' | 'dark';

/** The query parameter that picks the editor theme, as in `?theme=dark`. */
export const THEME_PARAM = 'theme';

/** The CodeMirror theme class each choice maps to. */
const THEME_CLASSES: Record<EditorTheme, string> = {
  light: 'playground-theme-eclipse',
  dark: 'playground-theme-material-darker',
};

/** Reads `?theme=` from a query string. Returns `null` when it isn't set. */
export function readThemeParam(search: string): EditorTheme | null {
  const value = new URLSearchParams(search).get(THEME_PARAM);
  return value === 'dark' || value === 'light' ? value : null;
}

/** Returns the other theme. */
export function otherTheme(theme: EditorTheme): EditorTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Returns the URL with `?theme=` set to the given theme. */
export function themeUrl(theme: EditorTheme, href: string): string {
  const url = new URL(href);
  url.searchParams.set(THEME_PARAM, theme);
  return url.toString();
}

/**
 * Picks the theme for this visit: the URL wins, then the remembered choice,
 * then dark.
 *
 * A theme chosen before is kept, so changing the default does not recolour
 * anyone's editors on them.
 */
export function initialTheme(search: string = window.location.search): EditorTheme {
  const fromUrl = readThemeParam(search);
  if (fromUrl) {
    return fromUrl;
  }
  const stored = readKey(STORAGE_KEYS.theme);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return DEFAULTS.theme;
}

let sheetsAdopted = false;

/** Applies a theme to the document so it reaches the editors. */
export function applyEditorTheme(theme: EditorTheme): void {
  if (!sheetsAdopted) {
    const sheets = [lightTheme.styleSheet, darkTheme.styleSheet].filter(
      (sheet): sheet is CSSStyleSheet => sheet !== undefined,
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
    sheetsAdopted = true;
  }
  for (const [name, className] of Object.entries(THEME_CLASSES)) {
    document.body.classList.toggle(className, name === theme);
  }
  document.body.dataset.editorTheme = theme;
  // The column collapse buttons sit on the editor surface, so on the dark one
  // they need the design system's colors for dark backgrounds to be seen.
  for (const button of document.querySelectorAll('.column__collapse')) {
    button.toggleAttribute('inverted', theme === 'dark');
  }
}

/**
 * Switches the editor theme: applies it, remembers it for the next visit, and
 * records it in the URL so a copied link opens the same way.
 */
export function setEditorTheme(theme: EditorTheme): void {
  applyEditorTheme(theme);
  writeKey(STORAGE_KEYS.theme, theme);
  window.history.replaceState(null, '', themeUrl(theme, window.location.href));
}
