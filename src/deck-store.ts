/**
 * The browser store that holds the user's decks.
 *
 * Decks live in IndexedDB, one entry per deck, so saving one deck never
 * rewrites the others. The bundled files in `decks/` and `presets/` only seed
 * the store on the first run.
 */
import {del, entries, get, set} from 'idb-keyval';

import type {Slide, StoredDeck} from './deck-model';
import {
  copyOfDeck,
  makeDeck,
  missingStarters,
  normalizeImport,
  toDeckFile,
} from './deck-model';
import {STARTER_DECKS} from './starters';

export type {Slide, StoredDeck};

/** The prefix every deck key carries inside the store. */
const KEY_PREFIX = 'nysds-playground:deck:';

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function isDeck(value: unknown): value is StoredDeck {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const deck = value as Partial<StoredDeck>;
  // An empty id belongs to the scratch pad, which is never a stored deck.
  return typeof deck.id === 'string' && deck.id !== '' && Array.isArray(deck.slides);
}

/** Every deck in the store, newest change first. */
export async function listDecks(): Promise<StoredDeck[]> {
  const all = await entries();
  const decks: StoredDeck[] = [];
  for (const [key, value] of all) {
    if (typeof key === 'string' && key.startsWith(KEY_PREFIX) && isDeck(value)) {
      decks.push(value);
    }
  }
  decks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return decks;
}

/** One deck, or `undefined` when the id is unknown. */
export async function getDeck(id: string): Promise<StoredDeck | undefined> {
  const value = await get(keyFor(id));
  return isDeck(value) ? value : undefined;
}

/** Writes a deck and stamps `updatedAt`. The scratch pad is never written. */
export async function saveDeck(deck: StoredDeck): Promise<StoredDeck> {
  const saved: StoredDeck = {...deck, updatedAt: new Date().toISOString()};
  if (saved.id === '') {
    return saved;
  }
  await set(keyFor(saved.id), saved);
  return saved;
}

/** Removes a deck. */
export async function deleteDeck(id: string): Promise<void> {
  await del(keyFor(id));
}

/** Returns every id currently in use. */
async function takenIds(): Promise<string[]> {
  return (await listDecks()).map((deck) => deck.id);
}

/** Creates a deck with one blank slide and returns it. */
export async function createDeck(title: string): Promise<StoredDeck> {
  const deck = makeDeck(title, await takenIds());
  await set(keyFor(deck.id), deck);
  return deck;
}

/** Copies a deck under a new id. */
export async function duplicateDeck(id: string): Promise<StoredDeck | undefined> {
  const deck = await getDeck(id);
  if (!deck) {
    return undefined;
  }
  const copy = copyOfDeck(deck, await takenIds());
  await set(keyFor(copy.id), copy);
  return copy;
}

/** The result of an import attempt. */
export type ImportOutcome =
  | {ok: true; deck: StoredDeck}
  | {ok: false; message: string};

/** Adds a deck from JSON text. */
export async function importDeck(json: string, fallbackName?: string): Promise<ImportOutcome> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {ok: false, message: 'That file is not valid JSON.'};
  }
  const result = normalizeImport(raw, await takenIds(), fallbackName);
  if (!result.ok) {
    return result;
  }
  await set(keyFor(result.deck.id), result.deck);
  return {ok: true, deck: result.deck};
}

/** Returns a deck as the JSON text a deck file holds. */
export async function exportDeck(id: string): Promise<string | undefined> {
  const deck = await getDeck(id);
  return deck ? `${JSON.stringify(toDeckFile(deck), null, 2)}\n` : undefined;
}

/**
 * Adds any bundled deck the store has not seen.
 *
 * Returns how many decks it added, so the home page can say so.
 */
export async function seedStarters(): Promise<number> {
  const stored = await listDecks();
  const additions = missingStarters(STARTER_DECKS, stored);
  // Starters carry a fixed timestamp so seeding is deterministic. Stamp them
  // as they land so the home page reports when they arrived here.
  const stamp = new Date().toISOString();
  for (const deck of additions) {
    await set(keyFor(deck.id), {...deck, createdAt: stamp, updatedAt: stamp});
  }
  return additions.length;
}
