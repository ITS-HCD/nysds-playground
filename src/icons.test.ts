/**
 * Fails when the shell, a preset, or a deck uses an icon NYSDS doesn't ship.
 *
 * A missing icon renders as empty space, which looks broken on a projector.
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

import {findIconNames, unknownIconNames} from './icon-names.ts';

const ROOT = join(import.meta.dirname, '..');

/** Reads every `.json` file in a directory and yields its name and text. */
function jsonFiles(dir: string): Array<{name: string; text: string}> {
  return readdirSync(join(ROOT, dir))
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({name: `${dir}/${file}`, text: readFileSync(join(ROOT, dir, file), 'utf8')}));
}

/** Pulls every string value out of parsed JSON, however deeply nested. */
function stringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringValues);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(stringValues);
  }
  return [];
}

test('findIconNames reads icon attributes and nys-icon names', () => {
  const html =
    '<nys-button prefixIcon="refresh"></nys-button>' +
    '<nys-button circle icon="close" label="x"></nys-button>' +
    '<nys-icon name="info"></nys-icon>' +
    '<nys-checkbox name="terms"></nys-checkbox>';
  assert.deepEqual(findIconNames(html), ['refresh', 'close', 'info']);
  assert.deepEqual(unknownIconNames('<nys-button prefixIcon="restart_alt">'), ['restart_alt']);
});

test('index.html uses only NYSDS icons', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual(unknownIconNames(html), []);
});

for (const dir of ['presets', 'decks']) {
  for (const file of jsonFiles(dir)) {
    test(`${file.name} uses only NYSDS icons`, () => {
      const markup = stringValues(JSON.parse(file.text)).join('\n');
      assert.deepEqual(unknownIconNames(markup), []);
    });
  }
}
