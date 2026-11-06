/**
 * Presentation mode and the slide bar.
 *
 * With `?present=1` the toolbar is hidden and the preview fills most of the
 * viewport, but the editors stay visible and editable so the presenter can
 * change a slide live. A caption bar at the bottom names the slide and carries
 * the controls.
 */
import {announce} from './announce';
import type {RememberedFocus} from './focus';
import {rememberFocus, usable} from './focus';
import {anyModalOpen} from './modals';
import type {Slide, StoredDeck} from './deck-model';
import {describeSlide, slideIndex} from './deck-model';
import type {EditorPanes} from './editor-panes';
import type {PaneId} from './editors';
import {PANE_FILES, PANE_IDS} from './editors';
import type {KeyContext, PathEntry, PresentationAction} from './keys';
import {hintText, isButtonContext, isTypingContext, isWidgetContext, routeKey} from './keys';
import {initialTheme, otherTheme, setEditorTheme} from './theme';
import {readFlag, writeFlag} from './settings';
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

type BarButton = HTMLElement & {disabled?: boolean};

/** Drives the slideshow. */
export class Presentation {
  private readonly target: PresentationTarget;
  private readonly app: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly group: HTMLElement;
  private readonly title: HTMLElement;
  private readonly deckTitle: HTMLElement;
  private readonly count: HTMLElement;
  private readonly description: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly notesBody: HTMLElement;
  private readonly notesButton: BarButton;
  private readonly prevButton: BarButton;
  private readonly nextButton: BarButton;
  private readonly codeButton: BarButton;
  private readonly panes: EditorPanes;
  private collapsed = false;
  private notesOpen = false;
  /** Where focus was when the notes opened, to hand it back when they close. */
  private notesOpener: RememberedFocus | undefined;
  private presenting = false;
  private singleKeys = readFlag('singleKeys');
  /** Whether the slide bar's last press came from a pointer rather than a key. */
  private pointer = false;

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
    this.deckTitle = required(root, '#present-deck-title');
    this.count = required(root, '#caption-count');
    this.description = required(root, '#caption-description');
    this.hint = required(root, '#present-hint');
    this.notes = required(root, '#notes');
    this.notesBody = required(root, '#notes-body');
    this.notesButton = required(root, '#notes-button');
    this.prevButton = required(root, '#prev-button');
    this.nextButton = required(root, '#next-button');
    this.codeButton = required(root, '#code-toggle-button');
  }

  /** Binds the slide bar, then enters presentation mode when asked. */
  start(present: boolean): void {
    this.collapsed = readFlag('codeCollapsed');
    this.applyCollapsed();
    this.hidePreviewToolbar();
    // A press in the slide bar from a pointer hands focus to the bar itself,
    // so Space keeps changing slides. A press from the keyboard leaves focus
    // on the button, so pressing it again does the same thing again.
    this.caption.addEventListener('pointerdown', () => {
      this.pointer = true;
    });
    this.caption.addEventListener('keydown', () => {
      this.pointer = false;
    });
    this.bindBarButton('#prev-button', () => this.step(-1));
    this.bindBarButton('#next-button', () => this.step(1));
    this.bindBarButton('#reset-slide-button', () => {
      this.target.resetSlide();
      this.refresh();
      announce('Slide reset.');
    });
    this.bindBarButton('#notes-button', () => this.toggleNotes());
    bindClick('#notes-close', () => this.closeNotes(true));
    this.bindBarButton('#code-toggle-button', () => this.setCodeHidden(!this.collapsed));
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
    this.focusBar();
  }

  /**
   * Leaves presentation mode, keeping the deck and slide in the URL.
   *
   * Focus goes back to Present when it was on a control that only shows while
   * presenting, such as Edit slides, or on nothing in particular.
   */
  exit(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    this.setPresenting(false);
    this.settleFocus(document.body, document.querySelector<HTMLElement>('#present-button'));
  }

  /** Whether the playground is presenting. */
  get isPresenting(): boolean {
    return this.presenting;
  }

  /**
   * Turns the single-key shortcuts on or off.
   *
   * The hint and the Hide code tooltip only mention `c` while it works.
   */
  setSingleKeys(on: boolean): void {
    this.singleKeys = on;
    this.applyCollapsed();
    this.refresh();
  }

  private setPresenting(presenting: boolean): void {
    this.presenting = presenting;
    this.app.classList.toggle('app--present', presenting);
    this.hint.hidden = true;
    this.hint.classList.remove('present-hint--fading');
    if (presenting) {
      this.showHint();
    } else {
      this.closeNotes();
    }
    this.target.setPresent(presenting);
    window.history.replaceState(null, '', presentUrl(presenting));
    this.refresh();
    announce(
      presenting
        ? `Presenting ${this.target.getDeck().title}. ${this.slideSummary()}`
        : 'Stopped presenting. Back to editing.',
    );
  }

  /** Redraws the caption and the notes from whatever is currently loaded. */
  refresh(): void {
    const deck = this.target.getDeck();
    const id = this.target.getActivePresetId();
    const index = slideIndex(deck, id);
    const preset = index >= 0 ? deck.slides[index] : undefined;
    this.deckTitle.textContent = deck.title;
    this.group.textContent = preset?.group ?? '';
    this.title.textContent = preset?.title ?? 'Custom code';
    this.description.textContent = preset?.description ?? '';
    // Screen readers get words rather than "1 slash 8". With no slides, the
    // counter stays empty, so its bullet goes too.
    const total = deck.slides.length;
    this.count.replaceChildren(
      ...(total === 0
        ? []
        : [
            span(`${index >= 0 ? index + 1 : '—'} / ${total}`, {hidden: true}),
            span(index >= 0 ? describeSlide(index, total) : `${total} slides`, {
              className: 'visually-hidden',
            }),
          ]),
    );
    // The arrows go quiet at the ends of the deck. From a shared code link,
    // where no slide is current, both still work: forward starts the deck and
    // back lands on its last slide.
    this.prevButton.disabled = deck.slides.length === 0 || index === 0;
    this.nextButton.disabled = deck.slides.length === 0 || index === deck.slides.length - 1;

    const notes = preset?.notes ?? '';
    this.notesBody.textContent = notes;
    this.notesButton.hidden = notes === '';
    // The tooltip has to go with its trigger, or it names a button nobody can
    // see.
    const notesTooltip = document.querySelector<HTMLElement>('nys-tooltip[for="notes-button"]');
    if (notesTooltip) {
      notesTooltip.hidden = notes === '';
    }
    if (!notes) {
      this.closeNotes();
    }
    this.hint.textContent = hintText({
      hasNotes: notes !== '',
      columns: this.panes.layout === 'columns',
      singleKeys: this.singleKeys,
    });
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
      this.settleFocus(this.caption, this.caption);
      announce(this.slideSummary());
    }
  }

  /** Names the slide on screen, as in "Slide 2 of 8: Alert". */
  private slideSummary(): string {
    const deck = this.target.getDeck();
    const index = slideIndex(deck, this.target.getActivePresetId());
    const slide = index >= 0 ? deck.slides[index] : undefined;
    return slide ? `${describeSlide(index, deck.slides.length, slide.title)}.` : 'Custom code.';
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
    if (anyModalOpen()) {
      return;
    }
    const action = routeKey(event, this.keyContext(event));
    if (action === null) {
      return;
    }
    event.preventDefault();
    this.run(action);
  }

  /**
   * Describes where a key press landed, for `routeKey`.
   *
   * The composed path is only walked if `routeKey` asks about it, which it
   * does only for a key that has a shortcut.
   */
  private keyContext(event: KeyboardEvent): KeyContext {
    let path: PathEntry[] | undefined;
    const entries = (): PathEntry[] => (path ??= pathFor(event));
    const target = event.target as Node | null;
    return {
      get typing() {
        return isTypingContext(entries());
      },
      get widget() {
        return isWidgetContext(entries());
      },
      get button() {
        return isButtonContext(entries());
      },
      inBar:
        target === null ||
        target === document.body ||
        target === document.documentElement ||
        this.caption.contains(target) ||
        this.notes.contains(target),
      presenting: this.presenting,
      notesOpen: this.notesOpen,
      singleKeys: this.singleKeys,
      columns: this.panes.layout === 'columns',
    };
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
        this.setCodeHidden(!this.collapsed);
        // Focus may have been in the drawer that just went away.
        this.settleFocus(this.caption, this.caption);
        announce(this.collapsed ? 'Code hidden.' : 'Code shown.');
        break;
      case 'toggle-notes':
        this.toggleNotes();
        break;
      case 'toggle-layout':
        this.panes.toggleLayout();
        this.refresh();
        this.settleFocus(this.caption, this.caption);
        announce(
          this.panes.layout === 'columns' ? 'Side-by-side editors.' : 'Tabbed editor.',
        );
        break;
      case 'toggle-theme':
        this.toggleTheme();
        break;
      case 'close-notes':
        this.closeNotes(true);
        break;
      case 'exit':
        this.exit();
        break;
      default: {
        const pane = paneFor(action);
        if (pane) {
          this.panes.togglePane(pane);
          this.settleFocus(this.caption, this.caption);
          const name = PANE_FILES[pane].label;
          announce(this.panes.isCollapsed(pane) ? `${name} collapsed.` : `${name} expanded.`);
        }
        break;
      }
    }
  }

  /** Switches the editors between light and dark and remembers the choice. */
  private toggleTheme(): void {
    const next = otherTheme(initialTheme());
    setEditorTheme(next);
    this.settleFocus(this.caption, this.caption);
    announce(next === 'dark' ? 'Dark editor theme.' : 'Light editor theme.');
  }

  /**
   * Binds one slide bar button.
   *
   * After a pointer press, focus moves to the slide bar, so Space and the
   * arrow keys keep changing slides. After a key press, focus stays on the
   * button, so its new state is read out and pressing it again repeats it.
   * When the press disabled or hid it, as Next does on the last slide, focus
   * moves to the arrow beside it, or to the slide bar.
   */
  private bindBarButton(selector: string, handler: () => void): void {
    const button = document.querySelector<BarButton>(selector);
    button?.addEventListener('nys-click', () => {
      handler();
      // The handler may have sent focus somewhere on purpose, such as into
      // the notes. Only a press that left focus in the bar is settled here.
      const active = document.activeElement;
      if (active !== document.body && !(active !== null && this.caption.contains(active))) {
        return;
      }
      if (this.pointer) {
        this.focusBar();
        return;
      }
      const sibling =
        button === this.nextButton ? this.prevButton : button === this.prevButton ? this.nextButton : null;
      this.settleFocus(this.caption, sibling, this.caption);
    });
  }

  /**
   * Hides or shows the code drawer and remembers the choice.
   *
   * The `c` key, the slide bar's Hide code button, and Reset settings all
   * come through here, so the button always describes the drawer on screen.
   */
  setCodeHidden(hidden: boolean): void {
    this.collapsed = hidden;
    writeFlag('codeCollapsed', hidden);
    this.applyCollapsed();
  }

  private applyCollapsed(): void {
    this.app.classList.toggle('app--code-collapsed', this.collapsed);
    // The tooltip is the button's only visible text, so it starts with the
    // accessible name and voice control users can say what they see.
    const label = this.collapsed ? 'Show code' : 'Hide code';
    this.codeButton.setAttribute('label', label);
    // Set the attribute, not the property: before the element upgrades, the
    // property is the browser's own ARIA reflection, which lands on the host
    // where nothing reads it.
    this.codeButton.setAttribute('ariaExpanded', String(!this.collapsed));
    document
      .querySelector('nys-tooltip[for="code-toggle-button"]')
      ?.setAttribute('text', this.singleKeys ? `${label} (c)` : label);
  }

  private toggleNotes(): void {
    if (this.notesOpen) {
      this.closeNotes(true);
      return;
    }
    if (!this.notesBody.textContent) {
      return;
    }
    this.notesOpen = true;
    this.notesOpener = rememberFocus();
    this.notes.hidden = false;
    this.notesButton.setAttribute('ariaExpanded', 'true');
    this.notes.focus();
  }

  /**
   * Hides the notes. With `restoreFocus`, focus goes back to whatever opened
   * them, or to the slide bar when that is gone.
   */
  private closeNotes(restoreFocus = false): void {
    const hadFocus = this.notes.contains(document.activeElement);
    this.notesOpen = false;
    this.notes.hidden = true;
    this.notesButton.setAttribute('ariaExpanded', 'false');
    if (!restoreFocus && !hadFocus) {
      return;
    }
    const opener = this.notesOpener;
    this.notesOpener = undefined;
    if (opener) {
      opener.restore(() => this.focusBar());
    } else {
      this.focusBar();
    }
  }

  /**
   * Moves focus to the slide bar.
   *
   * The preview is a cross-origin iframe. Once it holds focus, key events go
   * to the sandbox instead of this page, so the deck stops responding to the
   * arrow keys. Reclaiming focus after every step keeps them working.
   */
  private focusBar(): void {
    this.caption.focus({preventScroll: true});
  }

  /**
   * Leaves focus where it is, or moves it to the first of `fallbacks` that can
   * take it.
   *
   * Focus stays on a control inside `scope` that is still shown and enabled,
   * so a keyboard user keeps their place. The slide bar itself and the page
   * body never count as a place to stay: focus only lands there when it has
   * nowhere better to be.
   */
  private settleFocus(scope: HTMLElement, ...fallbacks: (HTMLElement | null)[]): void {
    const active = document.activeElement;
    const stays =
      active instanceof HTMLElement &&
      active !== this.caption &&
      active !== document.body &&
      scope.contains(active) &&
      usable(active);
    if (!stays) {
      fallbacks.find((element) => element !== null && usable(element))?.focus({preventScroll: true});
    }
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

/** Describes the elements on a key event's composed path. */
function pathFor(event: KeyboardEvent): PathEntry[] {
  const nodes = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const elements = nodes.filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (elements.length === 0 && event.target instanceof HTMLElement) {
    elements.push(event.target);
  }
  return elements.map((element) => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role'),
    editable: element.isContentEditable,
  }));
}

/** Builds a span of text, hidden from screen readers or from sight. */
function span(text: string, options: {hidden?: boolean; className?: string}): HTMLElement {
  const element = document.createElement('span');
  element.textContent = text;
  if (options.hidden) {
    element.setAttribute('aria-hidden', 'true');
  }
  if (options.className) {
    element.className = options.className;
  }
  return element;
}

function bindClick(selector: string, handler: () => void): void {
  document.querySelector(selector)?.addEventListener('nys-click', handler);
}

function required<T extends HTMLElement = HTMLElement>(
  root: Document | HTMLElement,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}
