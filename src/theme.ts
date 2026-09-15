/**
 * Light and dark editor themes.
 *
 * The preview always shows the design system as it is. Only the code editors
 * change. Light is the default because projectors wash out dark backgrounds.
 * Dark suits screen recordings, where a dark pane frames the light preview.
 */
import lightTheme from 'playground-elements/themes/eclipse.css.js';
import darkTheme from 'playground-elements/themes/material-darker.css.js';

/** The two editor themes the playground offers. */
export type EditorTheme = 'light' | 'dark';

/** The query parameter that picks the editor theme, as in `?theme=dark`. */
export const THEME_PARAM = 'theme';

/** Where the chosen theme is remembered between visits. */
const THEME_STORAGE_KEY = 'nysds-playground:editor-theme';

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
 * then light.
 */
export function initialTheme(search: string = window.location.search): EditorTheme {
  const fromUrl = readThemeParam(search);
  if (fromUrl) {
    return fromUrl;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // Private browsing can block storage. Light is fine.
  }
  return 'light';
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
}

/** Remembers the theme for the next visit. */
export function writeTheme(theme: EditorTheme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing can block storage. The URL still works.
  }
}
