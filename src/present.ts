/**
 * Presentation mode.
 *
 * With `?present=1` the toolbar is hidden and the preview fills most of the
 * viewport, but the editors stay visible and editable so the presenter can
 * change a slide live. A caption bar at the bottom names the slide and carries
 * the controls.
 */
import type {Slide, StoredDeck} from './deck-model';
import {slideIndex} from './deck-model';
import type {EditorPanes} from './editor-panes';
import type {PaneId} from './editors';
import {PANE_IDS} from './editors';
import type {PresentationAction} from './keys';
import {hintText, isTypingContext, routeKey} from './keys';
import {applyEditorTheme, initialTheme, otherTheme, themeUrl, writeTheme} from './theme';
import {STORAGE_KEYS, readKey, writeKey} from './settings';
import {presentUrl} from './state';

/** What presentation mode needs from the application shell. */
export interface PresentationTarget {
  /** Records whether the playground is presenting. */
  setPresent(present: boolean): void;
  /** The deck being presented. */
  getDeck(): StoredDeck;
  /** The id of the slide on screen, or `null` for a shared code link. */
  getActivePresetId(): string | null;
  /** Loads a slide, restoring any edits made to it earlier in the session. */
  loadPreset(preset: Slide): void;
  /** Discards this session's edits to the current slide. */
  resetSlide(): void;
}

/** How long the keyboard hint stays on screen, in milliseconds. */
const HINT_DURATION_MS = 6000;



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
  private presenting = false;

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

  /** Binds the slide bar, then enters presentation mode when asked. */
  start(present: boolean): void {
    this.collapsed = readCollapsed();
    this.applyCollapsed();
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
    if (present) {
      this.setPresenting(true);
    }
  }

  /**
   * Enters presentation mode.
   *
   * The page is not reloaded, so the click that asked for it still counts as
   * the user gesture that fullscreen requires.
   */
  enter(): void {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    this.setPresenting(true);
    this.takeFocus();
  }

  /** Leaves presentation mode, keeping the deck and slide in the URL. */
  exit(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    this.setPresenting(false);
  }

  /** Whether the playground is presenting. */
  get isPresenting(): boolean {
    return this.presenting;
  }

  private setPresenting(presenting: boolean): void {
    this.presenting = presenting;
    this.app.classList.toggle('app--present', presenting);
    this.hint.hidden = true;
    this.hint.classList.remove('present-hint--fading');
    if (presenting) {
      this.hidePreviewToolbar();
      this.showHint();
    } else {
      this.closeNotes();
    }
    this.target.setPresent(presenting);
    window.history.replaceState(null, '', presentUrl(presenting));
    this.refresh();
  }

  /** Redraws the caption and the notes from whatever is currently loaded. */
  refresh(): void {
    const deck = this.target.getDeck();
    const id = this.target.getActivePresetId();
    const index = slideIndex(deck, id);
    const preset = index >= 0 ? deck.slides[index] : undefined;
    this.group.textContent = preset?.group ?? '';
    this.title.textContent = preset?.title ?? 'Custom code';
    this.description.textContent = preset?.description ?? '';
    this.count.textContent =
      deck.slides.length === 0
        ? ''
        : `${index >= 0 ? index + 1 : '—'} / ${deck.slides.length}`;

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
    if (deck.slides.length === 0) {
      return;
    }
    const clamped = Math.min(Math.max(index, 0), deck.slides.length - 1);
    const preset = deck.slides[clamped];
    if (preset) {
      this.closeNotes();
      this.target.loadPreset(preset);
      this.refresh();
      this.takeFocus();
    }
  }

  private step(delta: number): void {
    const deck = this.target.getDeck();
    const current = slideIndex(deck, this.target.getActivePresetId());
    // From a shared code link, stepping forward starts the deck and stepping
    // back lands on the last slide.
    const next = current === -1 ? (delta > 0 ? 0 : deck.slides.length - 1) : current + delta;
    this.goTo(next);
  }

  private onKeyDown(event: KeyboardEvent): void {
    // A dialog owns the keyboard while it is open, including its own Escape.
    // Read the property rather than the attribute: the attribute only lands on
    // the component's next render, which is a frame too late.
    if (anyModalOpen()) {
      return;
    }
    // While editing, these keys belong to the slide bar. Alt plus an arrow
    // still steps from anywhere, as it does while presenting.
    if (!this.presenting && !event.altKey && !this.caption.contains(event.target as Node)) {
      return;
    }
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
        this.goTo(this.target.getDeck().slides.length - 1);
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
        this.exit();
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
  return readKey(STORAGE_KEYS.codeCollapsed) === '1';
}

function writeCollapsed(collapsed: boolean): void {
  writeKey(STORAGE_KEYS.codeCollapsed, collapsed ? '1' : '0');
}

/** Reports whether any design system dialog is on screen. */
function anyModalOpen(): boolean {
  return [...document.querySelectorAll('nys-modal')].some(
    (modal) => (modal as HTMLElement & {open?: boolean}).open === true,
  );
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
