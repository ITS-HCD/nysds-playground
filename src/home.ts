/**
 * The home view: the list of decks in this browser and the ways to add one.
 */
import type {StoredDeck} from './deck-model';
import {relativeTime} from './deck-model';

/** Marks the one action whose glyph the design system does not ship. */
const PLAY_ICON = 'play';

/** Makes a deck id safe to put in an element id. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** What the home view asks the application to do. */
export interface HomeActions {
  /** Opens a deck in the editor. */
  open(id: string): void;
  /** Opens a deck in presentation mode. */
  present(id: string): void;
  /** Copies a deck. */
  duplicate(id: string): Promise<void>;
  /** Downloads a deck as JSON. */
  exportDeck(id: string): Promise<void>;
  /** Asks to delete a deck, confirming first. */
  remove(deck: StoredDeck): void;
  /** Creates a deck from a title the person types. */
  create(): void;
  /** Imports one or more JSON files. */
  importFiles(files: FileList | File[]): Promise<void>;
  /** Adds back any bundled deck the store is missing. */
  restoreStarters(): Promise<void>;
  /** Opens the editor with no deck. */
  scratch(): void;
  /** Opens the settings modal. */
  openSettings(): void;
}

/** Renders and drives the home view. */
export class HomeView {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly actions: HomeActions;

  constructor(actions: HomeActions) {
    this.actions = actions;
    this.root = required('#home');
    this.list = required('#deck-list');
    this.fileInput = required<HTMLInputElement>('#import-file');
    this.bind();
  }

  /** Shows the home view and hides the editor. */
  show(decks: StoredDeck[]): void {
    document.querySelector('#app')?.classList.add('app--home');
    this.root.hidden = false;
    document.title = 'NYSDS Playground';
    this.render(decks);
  }

  /** Draws the deck cards. */
  render(decks: StoredDeck[]): void {
    this.list.replaceChildren();
    if (decks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'home__empty';
      empty.textContent = 'No decks yet. Create one, or restore the starter decks.';
      this.list.append(empty);
      return;
    }
    for (const deck of decks) {
      this.list.append(this.card(deck));
    }
  }

  private card(deck: StoredDeck): HTMLElement {
    const column = document.createElement('div');
    column.className =
      'nys-mobile-lg:nys-grid-col-6 nys-tablet:nys-grid-col-4 nys-display-flex';

    const card = document.createElement('nys-card');
    // The heading is rendered in the default slot instead of through the
    // `heading` property, because the property takes plain text and the title
    // has to be a link.
    const firstSlide = deck.slides[0]?.id ?? '';
    const heading = document.createElement('h2');
    heading.className = 'deck-card__title';
    const link = document.createElement('a');
    link.href = `?deck=${encodeURIComponent(deck.id)}&present=1#preset=${encodeURIComponent(firstSlide)}`;
    link.textContent = deck.title;
    heading.append(link);

    const meta = document.createElement('p');
    meta.className = 'deck-card__meta';
    const slides = deck.slides.length === 1 ? '1 slide' : `${deck.slides.length} slides`;
    meta.textContent = `${slides} · updated ${relativeTime(deck.updatedAt)}`;
    card.append(heading, meta);

    if (deck.description) {
      const description = document.createElement('p');
      description.className = 'deck-card__description';
      description.textContent = deck.description;
      card.append(description);
    }

    const footer = document.createElement('div');
    footer.slot = 'footer';
    footer.className = 'deck-card__actions';
    footer.append(this.action('Edit', 'filled', () => this.actions.open(deck.id)));
    footer.append(
      ...this.circle(deck.id, 'Present', PLAY_ICON, () => this.actions.present(deck.id)),
      ...this.circle(deck.id, 'Duplicate', 'content_copy', () =>
        void this.actions.duplicate(deck.id),
      ),
      ...this.circle(deck.id, 'Export', 'download', () =>
        void this.actions.exportDeck(deck.id),
      ),
      ...this.circle(deck.id, 'Delete', 'delete', () => this.actions.remove(deck)),
    );
    card.append(footer);
    column.append(card);
    return column;
  }

  private action(label: string, variant: string, handler: () => void): HTMLElement {
    const button = document.createElement('nys-button');
    button.setAttribute('label', label);
    button.setAttribute('size', 'sm');
    button.setAttribute('variant', variant);
    button.addEventListener('nys-click', handler);
    return button;
  }

  /**
   * Builds one icon-only action and the tooltip that names it.
   *
   * `label` is the accessible name, which circle buttons render as
   * visually hidden text, so the tooltip is the only visible hint.
   */
  private circle(
    deckId: string,
    label: string,
    icon: string,
    handler: () => void,
  ): HTMLElement[] {
    const id = `deck-${slug(deckId)}-${label.toLowerCase()}`;
    const tooltip = document.createElement('nys-tooltip');
    tooltip.setAttribute('for', id);
    tooltip.setAttribute('text', label);

    const button = document.createElement('nys-button');
    button.id = id;
    button.setAttribute('circle', '');
    button.setAttribute('size', 'sm');
    button.setAttribute('variant', 'outline');
    button.setAttribute('label', label);
    if (icon === PLAY_ICON) {
      // NYSDS ships no play glyph, so this one comes in through the slot.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('slot', 'circle-icon');
      svg.setAttribute('class', 'deck-card__play');
      svg.setAttribute('viewBox', '0 -960 960 960');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M320-200v-560l440 280-440 280Z');
      svg.append(path);
      button.append(svg);
    } else {
      button.setAttribute('icon', icon);
    }
    button.addEventListener('nys-click', handler);
    return [tooltip, button];
  }

  private bind(): void {
    on('#new-deck-button', () => this.actions.create());
    on('#import-deck-button', () => this.fileInput.click());
    on('#scratch-button', () => this.actions.scratch());
    on('#restore-starters-button', () => void this.actions.restoreStarters());
    on('#home-settings-button', () => this.actions.openSettings());

    this.fileInput.addEventListener('change', () => {
      const files = this.fileInput.files;
      if (files && files.length > 0) {
        void this.actions.importFiles(files);
      }
      // Clear the value so choosing the same file twice still fires.
      this.fileInput.value = '';
    });

    // Dropping a deck file anywhere on the home view imports it.
    const stop = (event: DragEvent): void => {
      event.preventDefault();
    };
    this.root.addEventListener('dragover', (event) => {
      stop(event);
      this.root.classList.add('home--dragging');
    });
    this.root.addEventListener('dragleave', () => {
      this.root.classList.remove('home--dragging');
    });
    this.root.addEventListener('drop', (event) => {
      stop(event);
      this.root.classList.remove('home--dragging');
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        void this.actions.importFiles(files);
      }
    });
  }
}

function on(selector: string, handler: () => void): void {
  document.querySelector(selector)?.addEventListener('nys-click', handler);
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}
