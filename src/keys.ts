/**
 * Key routing for the slide bar and presentation mode.
 *
 * The presenter edits code on the slide, so plain arrow keys have to reach the
 * editor. These helpers decide when a key means "change slide" and when it
 * means "move the caret". They take plain data so `src/state.test.ts` can
 * exercise them without a DOM.
 */

import type {PaneId} from './preset-schema';

/** Asks presentation mode to collapse or expand one editor column. */
export type TogglePaneAction = `toggle-pane:${PaneId}`;

/** What a key press asks presentation mode to do. */
export type PresentationAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'toggle-code'
  | 'toggle-notes'
  | 'toggle-theme'
  | 'toggle-layout'
  | TogglePaneAction
  | 'exit';

/** The column each number key toggles in the side-by-side layout. */
const PANE_KEYS: Record<string, PaneId> = {'1': 'html', '2': 'css', '3': 'js'};

/** The parts of a `KeyboardEvent` that routing depends on. */
export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Reports whether a key press asks for an immediate preview rebuild.
 *
 * `Cmd/Ctrl+Enter` and `Cmd/Ctrl+S` work everywhere, including mid-edit, so the
 * presenter never has to leave the editor to see a change.
 */
export function isBuildShortcut(event: KeyLike): boolean {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }
  return event.key === 'Enter' || event.key === 's' || event.key === 'S';
}

/**
 * One element on a key event's composed path.
 *
 * The path crosses shadow roots, so it sees the CodeMirror text box inside
 * `playground-file-editor` and the native control inside a design system
 * component.
 */
export interface PathEntry {
  /** The lowercase tag name. */
  tag: string;
  /** The `role` attribute, if the element has one. */
  role?: string | null;
  /** Whether the element is `contenteditable`. */
  editable?: boolean;
}

/** Elements whose key presses belong to the person typing, not to the deck. */
const TYPING_TAGS = new Set(['input', 'textarea', 'select']);

/** Roles that take typed text. */
const TYPING_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

/**
 * Roles that use the arrow keys, Home, and End themselves, such as the tabs
 * in the tabbed editor layout and the drawer's resize handle.
 */
const WIDGET_ROLES = new Set([
  'grid',
  'listbox',
  'menu',
  'menubar',
  'radiogroup',
  'separator',
  'slider',
  'tab',
  'tablist',
  'tree',
  'treegrid',
]);

/**
 * Reports whether a key press landed in something the presenter is typing in.
 *
 * The CodeMirror text box counts. The frame around it, which takes focus
 * first and says to press Enter to start editing, does not, so Escape there
 * reaches presentation mode.
 */
export function isTypingContext(path: readonly PathEntry[]): boolean {
  return path.some(
    (entry) =>
      TYPING_TAGS.has(entry.tag) ||
      TYPING_ROLES.has(entry.role ?? '') ||
      entry.editable === true,
  );
}

/**
 * Reports whether a key press landed on a widget that owns the arrow keys,
 * Home, and End, such as a tab list or the drawer's resize handle.
 */
export function isWidgetContext(path: readonly PathEntry[]): boolean {
  return path.some((entry) => WIDGET_ROLES.has(entry.role ?? ''));
}

/**
 * Reports whether a key press activates the button that has focus.
 *
 * Space presses a focused button, such as Hide code in the slide bar, so it
 * must not also change slides. Arrow keys and letter shortcuts still work
 * there. A `nys-button` puts its inner `button` on the path.
 */
export function isButtonPress(event: KeyLike, path: readonly PathEntry[]): boolean {
  return (
    event.key === ' ' && path.some((entry) => entry.tag === 'button' || entry.role === 'button')
  );
}

/** How a key press should be read, beyond the key itself. */
export interface RouteOptions {
  /** Focus is on a widget that owns the arrow keys, Home, and End. */
  widget?: boolean;
  /**
   * Whether the single-key shortcuts (`c`, `e`, `t`, `n`, and `1` to `3`) are
   * on. They are unless someone turns them off in Settings, which WCAG 2.1.4
   * asks for: speech input can type a dictated word as keystrokes, and each
   * letter would fire a shortcut.
   */
  singleKeys?: boolean;
}

/** Maps `ArrowRight` and friends to a step, or returns `null`. */
function stepFor(key: string): PresentationAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
      return 'prev';
    default:
      return null;
  }
}

/** Maps the keys that move through the deck, or returns `null`. */
function navigationFor(key: string): PresentationAction | null {
  switch (key) {
    case 'PageDown':
    case ' ':
      return 'next';
    case 'PageUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return stepFor(key);
  }
}

/** Maps the single-key shortcuts, or returns `null`. */
function singleKeyFor(key: string, columns: boolean): PresentationAction | null {
  switch (key) {
    case 'c':
    case 'C':
      return 'toggle-code';
    case 'n':
    case 'N':
      return 'toggle-notes';
    case 't':
    case 'T':
      return 'toggle-theme';
    case 'e':
    case 'E':
      return 'toggle-layout';
    default: {
      const pane = columns ? PANE_KEYS[key] : undefined;
      return pane ? `toggle-pane:${pane}` : null;
    }
  }
}

/**
 * Decides what a key press does.
 *
 * `Alt` plus an arrow steps the deck from anywhere, including mid-edit. Every
 * other shortcut is ignored while the presenter is typing, so the editor keeps
 * its own arrow keys, space bar, and Escape. On a widget that uses the arrow
 * keys itself, those keys and Home and End stay with the widget.
 *
 * Set `columns` when the side-by-side layout is on. The number keys toggle a
 * column only then, so they stay free otherwise.
 */
export function routeKey(
  event: KeyLike,
  typing: boolean,
  columns = false,
  options: RouteOptions = {},
): PresentationAction | null {
  const {widget = false, singleKeys = true} = options;
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.altKey) {
    return stepFor(event.key);
  }
  if (typing) {
    return null;
  }
  if (event.key === 'Escape') {
    return 'exit';
  }
  if (!widget) {
    const step = navigationFor(event.key);
    if (step) {
      return step;
    }
  }
  return singleKeys ? singleKeyFor(event.key, columns) : null;
}

/**
 * Builds the on-screen hint.
 *
 * Notes are left out when the slide has none, the column shortcuts only
 * appear in the side-by-side layout, and the single-key shortcuts only appear
 * while they are on.
 */
export function hintText(hasNotes: boolean, columns: boolean, singleKeys = true): string {
  const parts = ['← → or Alt+← → to change slides'];
  if (singleKeys) {
    parts.push('c code', 'e layout');
    if (columns) {
      parts.push('1 2 3 panes');
    }
    parts.push('t theme');
    if (hasNotes) {
      parts.push('n notes');
    }
  }
  parts.push('Esc exit');
  return parts.join(' · ');
}
