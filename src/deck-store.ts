/**
 * The browser store that holds the user's decks.
 *
 * Decks live in IndexedDB, one entry per deck, so saving one deck never
 * rewrites the others. The bundled files in `decks/` and `presets/` seed the
 * store once per browser, starter by starter.
 */
import {del, entries, get, set} from 'idb-keyval';

import type {Slide, StoredDeck} from './deck-model';
import {
  copyOfDeck,
  makeDeck,
  missingStarters,
  normalizeImport,
  staleStarters,
  startersToSeed,
  toDeckFile,
} from './deck-model';
import {RETIRED_STARTERS, STARTER_DECKS} from './starters';

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

/** Where the store records which starters this browser has received. */
const SEEDED_KEY = 'nysds-playground:seeded-starters';

async function seededStarters(): Promise<string[] | undefined> {
  const value: unknown = await get(SEEDED_KEY);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
}

/** The starter keys of the decks in the store now. */
function starterKeys(decks: readonly StoredDeck[]): string[] {
  return decks.map((deck) => deck.starter).filter((key): key is string => Boolean(key));
}

/** Writes starter decks into the store and records them as received. */
async function addStarters(
  additions: readonly StoredDeck[],
  seeded: readonly string[],
  before: readonly string[] | undefined,
): Promise<void> {
  // Starters carry a fixed timestamp so seeding is deterministic. Stamp them
  // as they land so the home page reports when they arrived here.
  const stamp = new Date().toISOString();
  for (const deck of additions) {
    await set(keyFor(deck.id), {...deck, createdAt: stamp, updatedAt: stamp});
  }
  // The record only grows, so a change in length is a change in content.
  if (seeded.length !== before?.length) {
    await set(SEEDED_KEY, [...seeded]);
  }
}

/**
 * Adds each bundled deck the first time this browser sees it.
 *
 * A starter seeds once per browser, so deleting one sticks, and a starter
 * that a later release adds still arrives once. First drops untouched copies
 * of starters that now ship under a new name, so a rename in `decks/` does
 * not leave the old deck beside the new one.
 */
export async function seedStarters(): Promise<void> {
  const stale = staleStarters(await listDecks(), RETIRED_STARTERS, STARTER_DECKS);
  for (const deck of stale) {
    await del(keyFor(deck.id));
  }
  const stored = await listDecks();
  const before = await seededStarters();
  const plan = startersToSeed(starterKeys(STARTER_DECKS), before, starterKeys(stored));
  const wanted = new Set(plan.seed);
  const additions = missingStarters(
    STARTER_DECKS.filter((deck) => deck.starter !== undefined && wanted.has(deck.starter)),
    stored,
  );
  await addStarters(additions, plan.seeded, before);
}

/**
 * Adds back every bundled deck the store is missing, including ones that were
 * deleted. Returns how many decks it added, so the home page can say so.
 */
export async function restoreStarters(): Promise<number> {
  const stored = await listDecks();
  const additions = missingStarters(STARTER_DECKS, stored);
  const before = await seededStarters();
  const plan = startersToSeed(starterKeys(STARTER_DECKS), before, [
    ...starterKeys(stored),
    ...starterKeys(additions),
  ]);
  await addStarters(additions, plan.seeded, before);
  return additions.length;
}
