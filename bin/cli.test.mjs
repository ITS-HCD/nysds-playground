/** Checks that link URLs keep the base's path, such as a GitHub Pages project site. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {linkUrl} from './cli.mjs';

const LOCATION = '/?deck=library#preset=button';

test('a base with a project path keeps that path', () => {
  assert.equal(
    linkUrl('https://its-hcd.github.io/nysds-playground/', LOCATION),
    'https://its-hcd.github.io/nysds-playground/?deck=library#preset=button',
  );
});

test('a base without a trailing slash is treated as a directory', () => {
  assert.equal(
    linkUrl('https://its-hcd.github.io/nysds-playground', LOCATION),
    'https://its-hcd.github.io/nysds-playground/?deck=library#preset=button',
  );
});

test('the default local base still works', () => {
  assert.equal(linkUrl('http://localhost:5173/', LOCATION), 'http://localhost:5173/?deck=library#preset=button');
});

test('a code hash on a project site keeps the path', () => {
  assert.equal(
    linkUrl('https://its-hcd.github.io/nysds-playground/', '/#code=abc'),
    'https://its-hcd.github.io/nysds-playground/#code=abc',
  );
});

test('an empty location returns the base', () => {
  assert.equal(linkUrl('https://its-hcd.github.io/nysds-playground/', '/'), 'https://its-hcd.github.io/nysds-playground/');
});
