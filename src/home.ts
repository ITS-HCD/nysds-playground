/**
 * The home view: the list of decks in this browser and the ways to add one.
 */
import type {StoredDeck} from './deck-model';
import {relativeTime} from './deck-model';

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
    card.setAttribute('heading', deck.title);
    card.setAttribute('headingLevel', 'h2');
    const slides = deck.slides.length === 1 ? '1 slide' : `${deck.slides.length} slides`;
    card.setAttribute('subheading', `${slides} · updated ${relativeTime(deck.updatedAt)}`);
    if (deck.description) {
      card.setAttribute('description', deck.description);
    }

    const footer = document.createElement('div');
    footer.slot = 'footer';
    footer.className = 'deck-card__actions';
    footer.append(
      this.action('Open', 'filled', () => this.actions.open(deck.id)),
      this.action('Present', 'outline', () => this.actions.present(deck.id)),
      this.action('Duplicate', 'ghost', () => void this.actions.duplicate(deck.id)),
      this.action('Export', 'ghost', () => void this.actions.exportDeck(deck.id)),
      this.action('Delete', 'ghost', () => this.actions.remove(deck)),
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
