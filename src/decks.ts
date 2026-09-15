/**
 * Loads the example library and the named decks at build time.
 *
 * Every JSON file in `presets/` becomes a slide of the implicit `library`
 * deck, ordered by filename. Every JSON file in `decks/` becomes a named deck
 * whose id is the filename without the extension.
 */
import type {Deck, Preset} from './preset-schema';
import {idFromPresetPath, parseDeck, parsePreset} from './preset-schema';

export type {Deck, Preset};

/** The id of the deck built from `presets/*.json`. */
export const LIBRARY_DECK_ID = 'library';

const presetModules = import.meta.glob<unknown>('../presets/*.json', {
  eager: true,
  import: 'default',
});

const deckModules = import.meta.glob<unknown>('../decks/*.json', {
  eager: true,
  import: 'default',
});

const libraryPresets: Preset[] = Object.keys(presetModules)
  .sort()
  .map((path) => parsePreset(path, presetModules[path], idFromPresetPath(path)))
  .filter((preset): preset is Preset => preset !== null);

/** The deck built from `presets/*.json`. */
export const LIBRARY_DECK: Deck = {
  id: LIBRARY_DECK_ID,
  title: 'Library',
  description: 'Every example in the presets folder.',
  baseCss: '',
  presets: libraryPresets,
};

/** The named decks, ordered by filename. */
export const NAMED_DECKS: Deck[] = Object.keys(deckModules)
  .sort()
  .map((path) => parseDeck(path, deckModules[path]))
  .filter((deck): deck is Deck => deck !== null);

/** Every deck, with the library first. */
export const DECKS: Deck[] = [LIBRARY_DECK, ...NAMED_DECKS];

/** Returns the deck with the given id, falling back to the library. */
export function getDeck(id: string | null | undefined): Deck {
  if (!id) {
    return LIBRARY_DECK;
  }
  return DECKS.find((deck) => deck.id === id) ?? LIBRARY_DECK;
}

/** Returns the slide with the given id inside a deck. */
export function getPreset(deck: Deck, id: string | null | undefined): Preset | undefined {
  if (!id) {
    return undefined;
  }
  return deck.presets.find((preset) => preset.id === id);
}

/** Returns the index of a slide inside a deck, or `-1`. */
export function presetIndex(deck: Deck, id: string | null | undefined): number {
  if (!id) {
    return -1;
  }
  return deck.presets.findIndex((preset) => preset.id === id);
}

/**
 * Returns the slide a deck opens on.
 *
 * The library deck opens on `welcome` when that preset exists.
 */
export function firstPreset(deck: Deck): Preset | undefined {
  if (deck.id === LIBRARY_DECK_ID) {
    return getPreset(deck, 'welcome') ?? deck.presets[0];
  }
  return deck.presets[0];
}
