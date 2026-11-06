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
  | 'close-notes'
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
 * Reports whether a key press landed on a button. A `nys-button` puts its
 * inner `button` on the path.
 */
export function isButtonContext(path: readonly PathEntry[]): boolean {
  return path.some((entry) => entry.tag === 'button' || entry.role === 'button');
}

/**
 * Where a key press landed and what the playground is doing.
 *
 * `routeKey` reads only what it needs, so the fields that walk the event's
 * composed path can be getters that do the walk on first use.
 */
export interface KeyContext {
  /** Focus is in something the presenter types in. See `isTypingContext`. */
  readonly typing: boolean;
  /** Focus is on a widget that owns the arrow keys, Home, and End. */
  readonly widget: boolean;
  /** Focus is on a button, which Space presses. */
  readonly button: boolean;
  /** Focus is in the slide bar or the notes, or on nothing in particular. */
  readonly inBar: boolean;
  /** The playground is presenting. */
  readonly presenting: boolean;
  /** The presenter notes are open. */
  readonly notesOpen: boolean;
  /**
   * The single-key shortcuts (`c`, `e`, `t`, `n`, and `1` to `3`) are on.
   * They are unless someone turns them off in Settings, which WCAG 2.1.4 asks
   * for: speech input can type a dictated word as keystrokes, and each letter
   * would fire a shortcut.
   */
  readonly singleKeys: boolean;
  /**
   * The side-by-side layout is on. The number keys toggle a column only
   * then, so they stay free otherwise.
   */
  readonly columns: boolean;
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

/** The single-key shortcuts, by lowercase key. */
const SINGLE_KEYS: Record<string, PresentationAction> = {
  c: 'toggle-code',
  n: 'toggle-notes',
  t: 'toggle-theme',
  e: 'toggle-layout',
};

/** Maps the single-key shortcuts, or returns `null`. */
function singleKeyFor(key: string, columns: boolean): PresentationAction | null {
  const pane = columns ? PANE_KEYS[key] : undefined;
  return SINGLE_KEYS[key.toLowerCase()] ?? (pane ? `toggle-pane:${pane}` : null);
}

/**
 * Decides what a key press does, or returns `null` to leave it alone.
 *
 * - Escape closes the notes from anywhere but a text field, before it does
 *   anything else.
 * - `Alt` plus an arrow steps the deck from anywhere, including mid-edit.
 * - While presenting, the other keys work from anywhere. While editing, they
 *   work when focus is in the slide bar or on nothing in particular, as
 *   right after the page loads, so they never fire from a toolbar control or
 *   the drawer.
 * - Every shortcut is ignored while the presenter is typing, so the editor
 *   keeps its own arrow keys, space bar, and Escape.
 * - Escape leaves presentation mode, and does nothing while editing.
 * - Space presses a focused button, such as Hide code in the slide bar, so it
 *   doesn't also change slides. On a widget that uses the arrow keys itself,
 *   those keys and Home and End stay with the widget.
 *
 * It works out what the key alone would do before it reads `typing`,
 * `button`, or `widget`, so most keys never look at the composed path.
 */
export function routeKey(event: KeyLike, context: KeyContext): PresentationAction | null {
  const {key} = event;
  if (key === 'Escape' && context.notesOpen && !context.typing) {
    return 'close-notes';
  }
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.altKey) {
    return stepFor(key);
  }
  if (!context.presenting && !context.inBar) {
    return null;
  }
  const navigation = navigationFor(key);
  const action =
    key === 'Escape'
      ? 'exit'
      : (navigation ?? (context.singleKeys ? singleKeyFor(key, context.columns) : null));
  if (action === null || context.typing) {
    return null;
  }
  if (action === 'exit') {
    return context.presenting ? action : null;
  }
  if ((key === ' ' && context.button) || (navigation !== null && context.widget)) {
    return null;
  }
  return action;
}

/**
 * Builds the on-screen hint.
 *
 * Notes are left out when the slide has none, the column shortcuts only
 * appear in the side-by-side layout, and the single-key shortcuts only appear
 * while they are on.
 */
export function hintText(
  context: Pick<KeyContext, 'columns' | 'singleKeys'> & {hasNotes: boolean},
): string {
  const parts = ['← → or Alt+← → to change slides'];
  if (context.singleKeys) {
    parts.push('c code', 'e layout');
    if (context.columns) {
      parts.push('1 2 3 panes');
    }
    parts.push('t theme');
    if (context.hasNotes) {
      parts.push('n notes');
    }
  }
  parts.push('Esc exit');
  return parts.join(' · ');
}
