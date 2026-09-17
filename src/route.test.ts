/** Checks the view a URL asks for and when history moves need a reboot. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {needsReboot, routeFor, sameRoute, slideIdFromHash} from './routing.ts';

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

test('moving between views needs a reboot', () => {
  const home = routeFor('', '');
  const scratch = routeFor('', '#code=x');
  const deck = routeFor('?deck=a', '#preset=one');
  const other = routeFor('?deck=b', '');

  assert.equal(needsReboot(home, scratch), true);
  assert.equal(needsReboot(scratch, home), true);
  assert.equal(needsReboot(home, deck), true);
  assert.equal(needsReboot(deck, other), true);
});

test('moving between slides of one deck does not', () => {
  const first = routeFor('?deck=a', '#preset=one');
  const second = routeFor('?deck=a&present=1', '#preset=two');
  assert.equal(needsReboot(first, second), false);
  assert.equal(sameRoute(first, second), true);
});

test('the home page stays the home page whatever the settings say', () => {
  assert.equal(needsReboot(routeFor('', ''), routeFor('?theme=dark&font=large', '')), false);
});

test('slideIdFromHash reads only a preset hash', () => {
  assert.equal(slideIdFromHash('#preset=01-a'), '01-a');
  assert.equal(slideIdFromHash('preset=01-a'), '01-a');
  assert.equal(slideIdFromHash('#code=abc'), null);
  assert.equal(slideIdFromHash(''), null);
  assert.equal(slideIdFromHash('#preset='), null);
});
