/**
 * The decks and examples bundled with the build.
 *
 * These are starter content. They seed the browser store the first time the
 * playground runs; after that the app reads only from the store. Every JSON
 * file in `decks/` becomes a starter deck, and all of `presets/` becomes one
 * starter deck called the component library.
 */
import type {RetiredStarter, StoredDeck} from './deck-model.ts';
import {makeSlide} from './deck-model.ts';
import type {Preset} from './preset-schema.ts';
import {idFromPresetPath, parseDeck, parsePreset} from './preset-schema.ts';

/** The starter id of the deck built from `presets/*.json`. */
export const LIBRARY_STARTER_ID = 'library';

const presetModules = import.meta.glob<unknown>('../presets/*.json', {
  eager: true,
  import: 'default',
});

const deckModules = import.meta.glob<unknown>('../decks/*.json', {
  eager: true,
  import: 'default',
});

/** A timestamp every starter shares, so seeding is deterministic. */
const SEEDED_AT = new Date(0).toISOString();

const libraryPresets: Preset[] = Object.keys(presetModules)
  .sort()
  .map((path) => parsePreset(path, presetModules[path], idFromPresetPath(path)))
  .filter((preset): preset is Preset => preset !== null)
  .map((preset) => makeSlide(preset));

const libraryDeck: StoredDeck = {
  id: LIBRARY_STARTER_ID,
  title: 'Component library',
  description: 'One example for every part of the design system.',
  baseCss: '',
  slides: libraryPresets,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
  starter: LIBRARY_STARTER_ID,
};

const bundledDecks: StoredDeck[] = Object.keys(deckModules)
  .sort()
  .map((path): StoredDeck | null => {
    const deck = parseDeck(path, deckModules[path]);
    if (!deck) {
      return null;
    }
    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      baseCss: deck.baseCss,
      slides: deck.presets.map((preset) => makeSlide(preset)),
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      starter: deck.id,
    };
  })
  .filter((deck): deck is StoredDeck => deck !== null);

/** Every bundled deck, with the component library first. */
export const STARTER_DECKS: StoredDeck[] = [libraryDeck, ...bundledDecks].filter(
  (deck) => deck.slides.length > 0,
);

/**
 * Starter keys that earlier builds seeded under a different file name.
 *
 * Renaming a file in `decks/` changes the deck's id and starter key, so a
 * browser that seeded the old name keeps that copy and seeds the new name
 * beside it. Listing the old name here lets `seedStarters` drop the stale copy
 * when nothing in it has changed.
 */
export const RETIRED_STARTERS: readonly RetiredStarter[] = [
  {
    starter: 'styling-levels',
    replacedBy: 'customizing-components',
    title: 'Three levels of strictness',
  },
];
