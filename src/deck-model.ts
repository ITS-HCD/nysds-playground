/**
 * The shape decks take in the browser store, and the pure helpers that build
 * and normalize them.
 *
 * Nothing here touches IndexedDB or the DOM, so `src/state.test.ts` can cover
 * id generation, import normalization, the export shape, and seed diffing
 * without a browser.
 */
import type {Preset} from './preset-schema.ts';
import {parseDeck, parsePreset} from './preset-schema.ts';

/** One slide. Same shape as a bundled preset. */
export type Slide = Preset;

/** A deck as the store holds it. */
export interface StoredDeck {
  /** The slug used in `?deck=`. Unique in the store. */
  id: string;
  /** The deck name. */
  title: string;
  /** One sentence describing the deck. */
  description: string;
  /** CSS injected into every slide's hidden head. */
  baseCss: string;
  /** The slides, in order. At least one. */
  slides: Slide[];
  /** When the deck was created, as an ISO timestamp. */
  createdAt: string;
  /** When the deck last changed, as an ISO timestamp. */
  updatedAt: string;
  /** The bundled starter this deck came from, when it came from one. */
  starter?: string;
}

/** The markup a brand new slide starts from. */
export const BLANK_SLIDE_HTML = '<nys-button label="Excelsior"></nys-button>\n';

/** Turns a title into a slug that is safe in a URL and a filename. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'deck';
}

/**
 * Returns `candidate`, or `candidate-2`, `candidate-3`, and so on until the id
 * is free.
 */
export function uniqueId(candidate: string, taken: readonly string[]): string {
  if (!taken.includes(candidate)) {
    return candidate;
  }
  for (let suffix = 2; ; suffix += 1) {
    const next = `${candidate}-${suffix}`;
    if (!taken.includes(next)) {
      return next;
    }
  }
}

/** Builds a slide id from a title, unique within the slides given. */
export function nextSlideId(title: string, slides: readonly Slide[]): string {
  const taken = slides.map((slide) => slide.id);
  const base = title.trim() ? slugify(title) : `slide-${slides.length + 1}`;
  return uniqueId(base, taken);
}

/** Fills in every field a slide needs, so callers can pass a partial one. */
export function makeSlide(partial: Partial<Slide> & {id: string; title: string}): Slide {
  return {
    id: partial.id,
    title: partial.title,
    description: partial.description ?? '',
    group: partial.group ?? '',
    notes: partial.notes ?? '',
    html: partial.html ?? '',
    css: partial.css ?? '',
    js: partial.js ?? '',
    version: partial.version ?? 'latest',
    editors: partial.editors ?? null,
  };
}

/** Builds an empty deck with one starter slide. */
export function makeDeck(title: string, taken: readonly string[], now = new Date()): StoredDeck {
  const stamp = now.toISOString();
  return {
    id: uniqueId(slugify(title), taken),
    title: title.trim() || 'Untitled deck',
    description: '',
    baseCss: '',
    slides: [makeSlide({id: 'slide-1', title: 'Slide 1', html: BLANK_SLIDE_HTML})],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Builds a copy of a deck under a free id. */
export function copyOfDeck(
  deck: StoredDeck,
  taken: readonly string[],
  now = new Date(),
): StoredDeck {
  const stamp = now.toISOString();
  return {
    ...deck,
    id: uniqueId(`${deck.id}-copy`, taken),
    title: `Copy of ${deck.title}`,
    slides: deck.slides.map((slide) => ({...slide})),
    createdAt: stamp,
    updatedAt: stamp,
    starter: undefined,
  };
}

/** Returns the index of a slide, or `-1`. */
export function slideIndex(deck: StoredDeck, id: string | null | undefined): number {
  return id ? deck.slides.findIndex((slide) => slide.id === id) : -1;
}

/** Returns a slide by id. */
export function getSlide(deck: StoredDeck, id: string | null | undefined): Slide | undefined {
  return id ? deck.slides.find((slide) => slide.id === id) : undefined;
}

/** The JSON shape a deck takes on disk, and what Export writes. */
export interface DeckFile {
  title: string;
  description: string;
  boilerplate: {baseCss: string};
  presets: Slide[];
}

/** Converts a stored deck to the deck file format, without timestamps. */
export function toDeckFile(deck: StoredDeck): DeckFile {
  return {
    title: deck.title,
    description: deck.description,
    boilerplate: {baseCss: deck.baseCss},
    presets: deck.slides.map((slide) => ({...slide})),
  };
}

/** What `normalizeImport` gives back. */
export type ImportResult =
  | {ok: true; deck: StoredDeck}
  | {ok: false; message: string};

/**
 * Turns imported JSON into a deck.
 *
 * It accepts a deck file, tolerating `$comment` and `boilerplate.head`, and
 * also a single preset object, which becomes a one-slide deck. Validation goes
 * through the same schema the bundled files use.
 */
export function normalizeImport(
  raw: unknown,
  taken: readonly string[],
  fallbackName = 'imported-deck',
  now = new Date(),
): ImportResult {
  // The id comes from the file name when there is one, the way the bundled
  // decks get theirs, so re-importing a deck file lands next to the original
  // as `<name>-2` rather than under a different slug.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {ok: false, message: 'That file is not a JSON object.'};
  }
  const record = raw as Record<string, unknown>;
  const stamp = now.toISOString();
  const problems: string[] = [];
  const collect = (message: string): void => {
    problems.push(message);
  };

  if (Array.isArray(record['presets']) || Array.isArray(record['slides'])) {
    const presets = record['presets'] ?? record['slides'];
    const deck = parseDeck(
      `${fallbackName}.json`,
      {...record, presets},
      collect,
      () => undefined,
    );
    if (!deck) {
      return {ok: false, message: problems[0] ?? 'That deck has no usable slides.'};
    }
    return {
      ok: true,
      deck: {
        id: uniqueId(slugify(fallbackName || deck.title), taken),
        title: deck.title,
        description: deck.description,
        baseCss: deck.baseCss,
        slides: deck.presets.map((preset) => ({...preset})),
        createdAt: stamp,
        updatedAt: stamp,
      },
    };
  }

  const preset = parsePreset(`${fallbackName}.json`, record, 'slide-1', collect);
  if (!preset) {
    return {ok: false, message: problems[0] ?? 'That file is not a deck or a preset.'};
  }
  return {
    ok: true,
    deck: {
      id: uniqueId(slugify(fallbackName || preset.title), taken),
      title: preset.title,
      description: preset.description,
      baseCss: '',
      slides: [preset],
      createdAt: stamp,
      updatedAt: stamp,
    },
  };
}

/** Returns the starter decks that are not in the store yet. */
export function missingStarters(
  starters: readonly StoredDeck[],
  stored: readonly StoredDeck[],
): StoredDeck[] {
  const seeded = new Set(stored.map((deck) => deck.starter).filter(Boolean));
  const takenIds = stored.map((deck) => deck.id);
  const additions: StoredDeck[] = [];
  for (const starter of starters) {
    if (starter.starter && seeded.has(starter.starter)) {
      continue;
    }
    const id = uniqueId(starter.id, [...takenIds, ...additions.map((deck) => deck.id)]);
    additions.push({...starter, id, slides: starter.slides.map((slide) => ({...slide}))});
  }
  return additions;
}

/** A starter key an earlier build seeded under a different file name. */
export interface RetiredStarter {
  /** The old starter key. */
  starter: string;
  /** The starter key the same deck ships under now. */
  replacedBy: string;
  /** The title the deck had when it was seeded under the old key. */
  title: string;
}

function sameCode(a: readonly Slide[], b: readonly Slide[]): boolean {
  return (
    a.length === b.length &&
    a.every((slide, i) => {
      const other = b[i]!;
      return slide.html === other.html && slide.css === other.css && slide.js === other.js;
    })
  );
}

/**
 * Returns the stored copies of retired starters that nobody has edited.
 *
 * A copy counts as untouched when it still has the old title and the same
 * slide code as the deck that replaced it. An edited copy is the user's
 * content now, so it stays.
 */
export function staleStarters(
  stored: readonly StoredDeck[],
  retired: readonly RetiredStarter[],
  starters: readonly StoredDeck[],
): StoredDeck[] {
  return stored.filter((deck) => {
    const retirement = retired.find((entry) => entry.starter === deck.starter);
    if (!retirement || deck.title !== retirement.title) {
      return false;
    }
    const replacement = starters.find((starter) => starter.starter === retirement.replacedBy);
    return replacement !== undefined && sameCode(deck.slides, replacement.slides);
  });
}

/** Formats an ISO timestamp as "today", "3 days ago", and so on. */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return 'unknown';
  }
  const days = Math.floor((now.getTime() - then) / 86400000);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
