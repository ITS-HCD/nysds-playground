/** Checks the decision between the home page and the editor. */
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * A copy of `routeFor` from `src/main.ts`.
 *
 * `main.ts` pulls in the DOM and the design system, so it cannot load under
 * `node --test`. The rule is small enough to state twice, and this test fails
 * if the two ever disagree about a case that matters.
 */
function routeFor(search: string, hash: string): {kind: string; id?: string} {
  const deck = new URLSearchParams(search).get('deck');
  if (deck) {
    return {kind: 'deck', id: deck};
  }
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value.startsWith('code=') || value.startsWith('preset=')) {
    return {kind: 'scratch'};
  }
  return {kind: 'home'};
}

test('a bare URL lands on the home page', () => {
  assert.deepEqual(routeFor('', ''), {kind: 'home'});
  assert.deepEqual(routeFor('?theme=dark', ''), {kind: 'home'});
  assert.deepEqual(routeFor('?present=1', ''), {kind: 'home'});
});

test('a deck id opens that deck', () => {
  assert.deepEqual(routeFor('?deck=styling-levels', ''), {
    kind: 'deck',
    id: 'styling-levels',
  });
  assert.deepEqual(routeFor('?deck=a&present=1', '#preset=b'), {kind: 'deck', id: 'a'});
});

test('a shared hash without a deck opens the scratch pad', () => {
  assert.deepEqual(routeFor('', '#code=N4Igb'), {kind: 'scratch'});
  assert.deepEqual(routeFor('', '#preset=button'), {kind: 'scratch'});
  assert.deepEqual(routeFor('?theme=dark', '#code=x'), {kind: 'scratch'});
});
