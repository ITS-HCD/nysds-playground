/**
 * Key routing for presentation mode.
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

/** Elements whose key presses belong to the person typing, not to the deck. */
const TYPING_TAGS = new Set([
  'playground-file-editor',
  'playground-code-editor',
  'input',
  'textarea',
  'select',
]);

/**
 * Reports whether a key press landed in something the presenter is typing in.
 *
 * Pass the lowercase tag names from the event's `composedPath()`, which
 * crosses shadow roots and so sees the CodeMirror editor inside
 * `playground-file-editor`.
 */
export function isTypingContext(pathTagNames: readonly string[]): boolean {
  return pathTagNames.some((tag) => TYPING_TAGS.has(tag));
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

/**
 * Decides what a key press does.
 *
 * `Alt` plus an arrow steps the deck from anywhere, including mid-edit. Every
 * other shortcut is ignored while the presenter is typing, so the editor keeps
 * its own arrow keys, space bar, and Escape.
 *
 * Set `columns` when the side-by-side layout is on. The number keys toggle a
 * column only then, so they stay free otherwise.
 */
export function routeKey(
  event: KeyLike,
  typing: boolean,
  columns = false,
): PresentationAction | null {
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.altKey) {
    return stepFor(event.key);
  }
  if (typing) {
    return null;
  }
  const step = stepFor(event.key);
  if (step) {
    return step;
  }
  switch (event.key) {
    case 'PageDown':
    case ' ':
      return 'next';
    case 'PageUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Escape':
      return 'exit';
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
    default:
      break;
  }
  const pane = columns ? PANE_KEYS[event.key] : undefined;
  return pane ? `toggle-pane:${pane}` : null;
}

/**
 * Builds the on-screen hint.
 *
 * Notes are left out when the slide has none, and the column shortcuts only
 * appear in the side-by-side layout.
 */
export function hintText(hasNotes: boolean, columns: boolean): string {
  const parts = ['← → or Alt+← → to change slides', 'c code', 'e layout'];
  if (columns) {
    parts.push('1 2 3 panes');
  }
  parts.push('t theme');
  if (hasNotes) {
    parts.push('n notes');
  }
  parts.push('Esc exit');
  return parts.join(' · ');
}
