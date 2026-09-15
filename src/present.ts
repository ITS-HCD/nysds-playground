/**
 * Presentation mode.
 *
 * With `?present=1` the toolbar is hidden and the preview fills most of the
 * viewport, but the editors stay visible and editable so the presenter can
 * change a slide live. A caption bar at the bottom names the slide and carries
 * the controls.
 */
import type {Deck, Preset} from './decks';
import {presetIndex} from './decks';
import type {EditorPanes} from './editor-panes';
import type {PaneId} from './editors';
import {PANE_IDS} from './editors';
import type {PresentationAction} from './keys';
import {hintText, isTypingContext, routeKey} from './keys';
import {applyEditorTheme, initialTheme, otherTheme, themeUrl, writeTheme} from './theme';
import {presentUrl} from './state';

/** What presentation mode needs from the application shell. */
export interface PresentationTarget {
  /** The deck being presented. */
  getDeck(): Deck;
  /** The id of the slide on screen, or `null` for a shared code link. */
  getActivePresetId(): string | null;
  /** Loads a slide, restoring any edits made to it earlier in the session. */
  loadPreset(preset: Preset): void;
  /** Discards this session's edits to the current slide. */
  resetSlide(): void;
}

/** How long the keyboard hint stays on screen, in milliseconds. */
const HINT_DURATION_MS = 6000;

/** Where the editor pane's collapsed state is remembered. */
const COLLAPSED_STORAGE_KEY = 'nysds-playground:present-code-collapsed';

/** Drives the slideshow. */
export class Presentation {
  private readonly target: PresentationTarget;
  private readonly app: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly group: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly count: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly notesBody: HTMLElement;
  private readonly notesButton: HTMLElement;
  private readonly panes: EditorPanes;
  private collapsed = false;
  private notesOpen = false;

  constructor(
    target: PresentationTarget,
    panes: EditorPanes,
    root: Document | HTMLElement = document,
  ) {
    this.target = target;
    this.panes = panes;
    this.app = required(root, '#app');
    this.caption = required(root, '#caption');
    this.group = required(root, '#caption-group');
    this.title = required(root, '#caption-title');
    this.description = required(root, '#caption-description');
    this.count = required(root, '#caption-count');
    this.hint = required(root, '#present-hint');
    this.notes = required(root, '#notes');
    this.notesBody = required(root, '#notes-body');
    this.notesButton = required(root, '#notes-button');
  }

  /** Turns on presentation mode and binds the controls. */
  start(): void {
    this.app.classList.add('app--present');
    this.caption.hidden = false;
    this.collapsed = readCollapsed();
    this.applyCollapsed();
    this.hidePreviewToolbar();
    bindClick('#prev-button', () => this.step(-1));
    bindClick('#next-button', () => this.step(1));
    bindClick('#reset-slide-button', () => {
      this.target.resetSlide();
      this.refresh();
      this.takeFocus();
    });
    bindClick('#notes-button', () => this.toggleNotes());
    bindClick('#notes-close', () => this.closeNotes());
    window.addEventListener('keydown', (event) => this.onKeyDown(event), true);
    this.refresh();
    this.showHint();
    this.takeFocus();
  }

  /** Redraws the caption and the notes from whatever is currently loaded. */
  refresh(): void {
    const deck = this.target.getDeck();
    const id = this.target.getActivePresetId();
    const index = presetIndex(deck, id);
    const preset = index >= 0 ? deck.presets[index] : undefined;
    this.group.textContent = preset?.group ?? '';
    this.title.textContent = preset?.title ?? 'Custom code';
    this.description.textContent = preset?.description ?? '';
    this.count.textContent =
      deck.presets.length === 0
        ? ''
        : `${index >= 0 ? index + 1 : '—'} / ${deck.presets.length}`;

    const notes = preset?.notes ?? '';
    this.notesBody.textContent = notes;
    this.notesButton.hidden = notes === '';
    if (!notes) {
      this.closeNotes();
    }
    this.hint.textContent = hintText(notes !== '', this.panes.layout === 'columns');
  }

  /** Moves to the slide at `index`, clamped to the deck. */
  goTo(index: number): void {
    const deck = this.target.getDeck();
    if (deck.presets.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(index, 0), deck.presets.length - 1);
    const preset = deck.presets[clamped];
    if (preset) {
      this.closeNotes();
      this.target.loadPreset(preset);
      this.refresh();
      this.takeFocus();
    }
  }

  private step(delta: number): void {
    const deck = this.target.getDeck();
    const current = presetIndex(deck, this.target.getActivePresetId());
    // From a shared code link, stepping forward starts the deck and stepping
    // back lands on the last slide.
    const next = current === -1 ? (delta > 0 ? 0 : deck.presets.length - 1) : current + delta;
    this.goTo(next);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const typing = isTypingContext(tagNamesFor(event));
    const action = routeKey(event, typing, this.panes.layout === 'columns');
    if (action === null) {
      return;
    }
    // Escape closes the notes before it leaves presentation mode.
    if (action === 'exit' && this.notesOpen) {
      event.preventDefault();
      this.closeNotes();
      this.takeFocus();
      return;
    }
    event.preventDefault();
    this.run(action);
  }

  private run(action: PresentationAction): void {
    switch (action) {
      case 'next':
        this.step(1);
        break;
      case 'prev':
        this.step(-1);
        break;
      case 'first':
        this.goTo(0);
        break;
      case 'last':
        this.goTo(this.target.getDeck().presets.length - 1);
        break;
      case 'toggle-code':
        this.toggleCode();
        break;
      case 'toggle-notes':
        this.toggleNotes();
        break;
      case 'toggle-layout':
        this.panes.toggleLayout();
        this.refresh();
        this.takeFocus();
        break;
      case 'toggle-theme':
        this.toggleTheme();
        break;
      case 'exit':
        window.location.href = presentUrl(false);
        break;
      default: {
        const pane = paneFor(action);
        if (pane) {
          this.panes.togglePane(pane);
          this.takeFocus();
        }
        break;
      }
    }
  }

  /** Switches the editors between light and dark and remembers the choice. */
  private toggleTheme(): void {
    const next = otherTheme(initialTheme());
    applyEditorTheme(next);
    writeTheme(next);
    window.history.replaceState(null, '', themeUrl(next, window.location.href));
    this.takeFocus();
  }

  private toggleCode(): void {
    this.collapsed = !this.collapsed;
    this.applyCollapsed();
    writeCollapsed(this.collapsed);
    this.takeFocus();
  }

  private applyCollapsed(): void {
    this.app.classList.toggle('app--code-collapsed', this.collapsed);
  }

  private toggleNotes(): void {
    if (this.notesOpen) {
      this.closeNotes();
      this.takeFocus();
      return;
    }
    if (!this.notesBody.textContent) {
      return;
    }
    this.notesOpen = true;
    this.notes.hidden = false;
    this.notes.focus?.();
  }

  private closeNotes(): void {
    this.notesOpen = false;
    this.notes.hidden = true;
  }

  /**
   * Moves focus to the caption bar.
   *
   * The preview is a cross-origin iframe. Once it holds focus, key events go
   * to the sandbox instead of this page, so the deck stops responding to the
   * arrow keys. Reclaiming focus after every step keeps them working. After an
   * edit, focus stays in the editor, which is what the presenter wants.
   */
  private takeFocus(): void {
    this.caption.focus({preventScroll: true});
  }

  /**
   * Hides the preview's own header bar so the slide fills the screen.
   *
   * `playground-preview` exposes no CSS part for the bar, so the rule goes
   * into its shadow root. Setting `--playground-bar-height` alone leaves the
   * label and the reload button visible.
   */
  private hidePreviewToolbar(): void {
    const root = document.querySelector('#preview')?.shadowRoot;
    if (!root) {
      return;
    }
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('#toolbar { display: none; }');
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch {
      // Constructable stylesheets are optional. The bar is only cosmetic.
    }
  }

  private showHint(): void {
    this.hint.hidden = false;
    window.setTimeout(() => {
      this.hint.classList.add('present-hint--fading');
      window.setTimeout(() => {
        this.hint.hidden = true;
      }, 700);
    }, HINT_DURATION_MS);
  }
}

/** Returns the column a `toggle-pane:` action names, or `undefined`. */
function paneFor(action: PresentationAction): PaneId | undefined {
  const prefix = 'toggle-pane:';
  if (typeof action !== 'string' || !action.startsWith(prefix)) {
    return undefined;
  }
  const pane = action.slice(prefix.length);
  return PANE_IDS.find((candidate) => candidate === pane);
}

/** Returns the lowercase tag names on a key event's composed path. */
function tagNamesFor(event: KeyboardEvent): string[] {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const names: string[] = [];
  for (const node of path) {
    const tag = (node as Element).tagName;
    if (typeof tag === 'string') {
      names.push(tag.toLowerCase());
    }
  }
  if (names.length === 0 && event.target instanceof Element) {
    names.push(event.target.tagName.toLowerCase());
  }
  return names;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Private browsing can block storage. The default is fine.
  }
}

function bindClick(selector: string, handler: () => void): void {
  document.querySelector(selector)?.addEventListener('nys-click', handler);
}

function required(root: Document | HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}
