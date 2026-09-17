/**
 * Checks for the deck model and the route decision.
 *
 * These cover the parts of the store that do not need IndexedDB: id
 * generation, collision handling, import normalization, the export shape, and
 * seed diffing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  copyOfDeck,
  makeDeck,
  makeSlide,
  missingStarters,
  nextSlideId,
  normalizeImport,
  relativeTime,
  slideIndex,
  slugify,
  toDeckFile,
  uniqueId,
} from './deck-model.ts';
import type {StoredDeck} from './deck-model.ts';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function deck(id: string, extra: Partial<StoredDeck> = {}): StoredDeck {
  return {
    id,
    title: id,
    description: '',
    baseCss: '',
    slides: [makeSlide({id: 'slide-1', title: 'Slide 1', html: 'x'})],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...extra,
  };
}

test('slugify makes a url-safe id', () => {
  assert.equal(slugify('Three Levels of Strictness!'), 'three-levels-of-strictness');
  assert.equal(slugify('  '), 'deck');
  assert.equal(slugify('a'.repeat(120)).length, 60);
});

test('uniqueId appends a counter until the id is free', () => {
  assert.equal(uniqueId('deck', []), 'deck');
  assert.equal(uniqueId('deck', ['deck']), 'deck-2');
  assert.equal(uniqueId('deck', ['deck', 'deck-2', 'deck-3']), 'deck-4');
});

test('nextSlideId falls back to a numbered id and avoids collisions', () => {
  const slides = [makeSlide({id: 'intro', title: 'Intro'})];
  assert.equal(nextSlideId('Second', slides), 'second');
  assert.equal(nextSlideId('Intro', slides), 'intro-2');
  assert.equal(nextSlideId('   ', slides), 'slide-2');
});

test('makeDeck starts with one usable slide', () => {
  const made = makeDeck('My Deck', ['my-deck'], NOW);
  assert.equal(made.id, 'my-deck-2');
  assert.equal(made.title, 'My Deck');
  assert.equal(made.slides.length, 1);
  assert.equal(made.slides[0]?.html, '<nys-button label="Excelsior"></nys-button>\n');
  assert.equal(made.createdAt, made.updatedAt);
});

test('copyOfDeck takes a free id and drops the starter link', () => {
  const copy = copyOfDeck(deck('library', {starter: 'library'}), ['library', 'library-copy'], NOW);
  assert.equal(copy.id, 'library-copy-2');
  assert.equal(copy.title, 'Copy of library');
  assert.equal(copy.starter, undefined);
});

test('slideIndex finds a slide or reports -1', () => {
  const d = deck('a');
  assert.equal(slideIndex(d, 'slide-1'), 0);
  assert.equal(slideIndex(d, 'missing'), -1);
  assert.equal(slideIndex(d, null), -1);
});

test('toDeckFile writes the deck file shape without timestamps', () => {
  const file = toDeckFile(deck('a', {title: 'A', description: 'd', baseCss: 'p{}'}));
  assert.deepEqual(Object.keys(file), ['title', 'description', 'boilerplate', 'presets']);
  assert.deepEqual(file.boilerplate, {baseCss: 'p{}'});
  assert.equal(file.presets.length, 1);
  assert.equal('createdAt' in file, false);
});

test('normalizeImport accepts a deck file and tolerates extra keys', () => {
  const result = normalizeImport(
    {
      $comment: 'ignore me',
      title: 'Styling Levels',
      boilerplate: {head: '<link>', baseCss: 'body{}'},
      presets: [{id: '01-a', title: 'A', html: '<p>a</p>'}],
    },
    [],
    'styling-levels',
    NOW,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.deck.id, 'styling-levels');
  assert.equal(result.deck.baseCss, 'body{}');
  assert.equal(result.deck.slides.length, 1);
});

test('normalizeImport appends a suffix when the file name is taken', () => {
  const raw = {title: 'Three levels of strictness', presets: [{id: 'a', title: 'A', html: 'x'}]};
  const first = normalizeImport(raw, ['styling-levels'], 'styling-levels', NOW);
  assert.equal(first.ok && first.deck.id, 'styling-levels-2');
  const second = normalizeImport(raw, ['styling-levels', 'styling-levels-2'], 'styling-levels', NOW);
  assert.equal(second.ok && second.deck.id, 'styling-levels-3');
});

test('normalizeImport falls back to the title when there is no file name', () => {
  const raw = {title: 'Styling Levels', presets: [{id: 'a', title: 'A', html: 'x'}]};
  const result = normalizeImport(raw, [], '', NOW);
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.deck.id : '', 'styling-levels');
});

test('normalizeImport accepts a single preset as a one-slide deck', () => {
  const result = normalizeImport(
    {title: 'Button', html: '<nys-button></nys-button>', css: '', js: ''},
    [],
    'button',
    NOW,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.deck.slides.length, 1);
  assert.equal(result.deck.title, 'Button');
});

test('normalizeImport rejects what is not a deck', () => {
  assert.equal(normalizeImport([1, 2], [], 'x', NOW).ok, false);
  assert.equal(normalizeImport('nope', [], 'x', NOW).ok, false);
  assert.equal(normalizeImport({presets: []}, [], 'x', NOW).ok, false);
});

test('missingStarters adds only the starters the store has not seen', () => {
  const starters = [
    deck('library', {starter: 'library'}),
    deck('styling-levels', {starter: 'styling-levels'}),
  ];
  assert.equal(missingStarters(starters, []).length, 2);
  assert.deepEqual(
    missingStarters(starters, [deck('library', {starter: 'library'})]).map((d) => d.id),
    ['styling-levels'],
  );
  assert.equal(missingStarters(starters, starters).length, 0);
});

test('missingStarters keeps a restored starter off an id already in use', () => {
  const starters = [deck('library', {starter: 'library'})];
  const stored = [deck('library')];
  assert.deepEqual(missingStarters(starters, stored).map((d) => d.id), ['library-2']);
});

test('relativeTime reads as a person would say it', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  assert.equal(relativeTime('2026-09-16T09:00:00.000Z', now), 'today');
  assert.equal(relativeTime('2026-09-15T09:00:00.000Z', now), 'yesterday');
  assert.equal(relativeTime('2026-09-10T12:00:00.000Z', now), '6 days ago');
  assert.equal(relativeTime('2026-07-16T12:00:00.000Z', now), '2 months ago');
  assert.equal(relativeTime('not a date', now), 'unknown');
});

/* Confirm dialog handler lifetime ---------------------------------------- */

/**
 * The shape of `confirmAction` in `src/main.ts`, minus the DOM.
 *
 * Deleting one deck used to delete its neighbour: dismissing the modal with
 * its own close button skipped the Cancel handler, so the next question added
 * a second listener and one confirmation answered both.
 */
function makeConfirm(): {
  ask(onConfirm: () => void): void;
  confirm(): void;
  dismiss(): void;
} {
  const listeners = new Set<() => void>();
  let controller: {abort(): void} | undefined;
  return {
    ask(onConfirm) {
      controller?.abort();
      const handler = (): void => {
        listeners.delete(handler);
        controller = undefined;
        onConfirm();
      };
      listeners.add(handler);
      controller = {
        abort() {
          listeners.delete(handler);
        },
      };
    },
    confirm() {
      for (const handler of [...listeners]) {
        handler();
      }
    },
    dismiss() {
      controller?.abort();
      controller = undefined;
    },
  };
}

test('confirming answers only the question on screen', () => {
  const confirm = makeConfirm();
  const answered: string[] = [];
  // The first question is dismissed without Cancel, the way the modal's own
  // close button does it.
  confirm.ask(() => answered.push('first'));
  confirm.ask(() => answered.push('second'));
  confirm.confirm();
  assert.deepEqual(answered, ['second']);
});

test('confirming twice does not repeat the previous answer', () => {
  const confirm = makeConfirm();
  const answered: string[] = [];
  confirm.ask(() => answered.push('a'));
  confirm.confirm();
  confirm.ask(() => answered.push('b'));
  confirm.confirm();
  assert.deepEqual(answered, ['a', 'b']);
});

test('dismissing leaves nothing to answer', () => {
  const confirm = makeConfirm();
  const answered: string[] = [];
  confirm.ask(() => answered.push('a'));
  confirm.dismiss();
  confirm.confirm();
  assert.deepEqual(answered, []);
});

/* Untitled decks ---------------------------------------------------------- */

test('a new deck is called Untitled and takes the next free id', () => {
  const first = makeDeck('Untitled', [], NOW);
  assert.equal(first.id, 'untitled');
  assert.equal(first.title, 'Untitled');

  const second = makeDeck('Untitled', ['untitled'], NOW);
  assert.equal(second.id, 'untitled-2');

  const third = makeDeck('Untitled', ['untitled', 'untitled-2'], NOW);
  assert.equal(third.id, 'untitled-3');
});

test('renaming a deck does not move its id', () => {
  // The id is generated once, at creation; a later title is only a label.
  const deck = makeDeck('Untitled', [], NOW);
  const renamed = {...deck, title: 'Three levels of strictness'};
  assert.equal(renamed.id, 'untitled');
});
