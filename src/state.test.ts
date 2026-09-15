/**
 * Sanity checks for the pure helpers. Run them with `npm test`.
 *
 * These modules import nothing from the DOM, so Node can load them directly
 * with its built-in TypeScript type stripping.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {deckUrl, decodeState, encodeState, parseHash, presentUrl, slugify} from './state.ts';
import {isTypingContext, routeKey} from './keys.ts';
import {parseDeck, parsePreset} from './preset-schema.ts';
import {chooseVersion} from './version-catalog.ts';
import {splitUserHtml, wrapUserHtml} from './wrapper.ts';

/** Collects validation messages instead of writing them to the console. */
function collector(): {messages: string[]; report: (message: string) => void} {
  const messages: string[] = [];
  return {messages, report: (message) => messages.push(message)};
}

const WRAPPER_OPTIONS = {
  stylesHref: 'https://cdn.example.com/styles.css',
  componentsSrc: 'https://cdn.example.com/components.js',
  title: 'Preview',
};

test('wrapUserHtml round-trips through splitUserHtml', () => {
  const userHtml = '<nys-button label="Save"></nys-button>';
  const wrapped = wrapUserHtml(userHtml, WRAPPER_OPTIONS);
  assert.equal(splitUserHtml(wrapped), userHtml);
});

test('wrapUserHtml round-trips multi-line and comment-bearing markup', () => {
  const userHtml = '<!-- a note -->\n<div>\n  <p>Line</p>\n</div>';
  const wrapped = wrapUserHtml(userHtml, WRAPPER_OPTIONS);
  assert.equal(splitUserHtml(wrapped), userHtml);
});

test('wrapUserHtml keeps the boilerplate inside hidden regions', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', WRAPPER_OPTIONS);
  assert.ok(wrapped.includes('<!-- playground-hide -->'));
  assert.ok(wrapped.includes('<!-- playground-hide-end -->'));
  assert.ok(wrapped.includes(WRAPPER_OPTIONS.stylesHref));
  assert.ok(wrapped.includes(WRAPPER_OPTIONS.componentsSrc));
});

test('wrapUserHtml adds extra head markup when configured', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    ...WRAPPER_OPTIONS,
    extraHeadHtml: '<link rel="stylesheet" href="https://fonts.example.com/f.css" />',
  });
  assert.ok(wrapped.includes('https://fonts.example.com/f.css'));
});

test('splitUserHtml returns null when the markers are gone', () => {
  assert.equal(splitUserHtml('<p>no markers here</p>'), null);
});

test('encodeState and decodeState round-trip', () => {
  const state = {
    version: '1.21.0',
    html: '<nys-alert type="info" heading="Hello"></nys-alert>',
    css: 'body {\n  padding: 1rem;\n}',
    js: "console.log('hi');",
  };
  const decoded = decodeState(encodeState(state));
  assert.deepEqual(decoded, state);
});

test('decodeState rejects unusable values', () => {
  assert.equal(decodeState('not-valid-lz'), null);
  assert.equal(decodeState(''), null);
});

test('parseHash recognises both hash forms', () => {
  assert.deepEqual(parseHash('#preset=button'), {kind: 'preset', id: 'button'});
  assert.deepEqual(parseHash(''), {kind: 'default'});
  assert.deepEqual(parseHash('#code=garbage!!'), {kind: 'default'});

  const state = {version: 'latest', html: '<p>x</p>', css: '', js: ''};
  const parsed = parseHash(`#code=${encodeState(state)}`);
  assert.equal(parsed.kind, 'code');
  assert.deepEqual(parsed.kind === 'code' ? parsed.state : null, state);
});

test('presentUrl toggles the query parameter and keeps the hash', () => {
  const base = 'https://example.com/app/#preset=button';
  const on = presentUrl(true, base);
  assert.ok(on.includes('present=1'));
  assert.ok(on.endsWith('#preset=button'));
  assert.equal(presentUrl(false, on), base);
});

test('slugify produces filename-safe ids', () => {
  assert.equal(slugify('Button & Links!'), 'button-links');
  assert.equal(slugify('   '), 'playground');
});

test('wrapUserHtml injects the deck base CSS into the hidden head', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    ...WRAPPER_OPTIONS,
    baseCss: 'body { padding: 2rem }',
  });
  assert.ok(wrapped.includes('<style>body { padding: 2rem }</style>'));
  assert.equal(splitUserHtml(wrapped), '<p>Hi</p>');
});

test('deckUrl keeps the library deck out of the query', () => {
  const base = 'https://example.com/app/?present=1#preset=old';
  assert.equal(
    deckUrl('library', 'welcome', 'library', base),
    'https://example.com/app/?present=1#preset=welcome',
  );
  assert.equal(
    deckUrl('styling-levels', '01-header-drop-in', 'library', base),
    'https://example.com/app/?present=1&deck=styling-levels#preset=01-header-drop-in',
  );
});

/* Preset and deck validation ------------------------------------------- */

test('parsePreset fills in defaults and keeps the new optional fields', () => {
  const {messages, report} = collector();
  const preset = parsePreset(
    '../presets/01-button.json',
    {title: 'Button', html: '<nys-button></nys-button>', group: 'Basics', notes: 'Say this'},
    'button',
    report,
  );
  assert.deepEqual(preset, {
    id: 'button',
    title: 'Button',
    description: '',
    group: 'Basics',
    notes: 'Say this',
    html: '<nys-button></nys-button>',
    css: '',
    js: '',
    version: 'latest',
  });
  assert.deepEqual(messages, []);
});

test('parsePreset names the bad file and field', () => {
  const {messages, report} = collector();
  const preset = parsePreset('../presets/02-alert.json', {title: 42, html: 'x'}, 'alert', report);
  assert.equal(preset?.title, 'alert');
  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? '', /02-alert\.json/);
  assert.match(messages[0] ?? '', /"title"/);
});

test('parsePreset requires an id when the filename cannot supply one', () => {
  const {messages, report} = collector();
  assert.equal(parsePreset('../decks/d.json#presets[0]', {title: 'x'}, null, report), null);
  assert.match(messages.join('\n'), /"id"/);
});

test('parseDeck reads the base CSS and the slides', () => {
  const {messages, report} = collector();
  const deck = parseDeck(
    '../decks/styling-levels.json',
    {
      title: 'Three levels of strictness',
      boilerplate: {baseCss: 'body { padding: 2rem }'},
      presets: [{id: '01-a', group: 'One', title: 'A', html: '<p>a</p>'}],
    },
    report,
  );
  assert.equal(deck?.id, 'styling-levels');
  assert.equal(deck?.title, 'Three levels of strictness');
  assert.equal(deck?.baseCss, 'body { padding: 2rem }');
  assert.equal(deck?.presets.length, 1);
  assert.equal(deck?.presets[0]?.group, 'One');
  assert.deepEqual(messages, []);
});

test('parseDeck warns about boilerplate.head and ignores it', () => {
  const errors = collector();
  const warnings = collector();
  const deck = parseDeck(
    '../decks/d.json',
    {
      title: 'D',
      boilerplate: {head: '<link>', baseCss: 'p{}'},
      presets: [{id: 'a', title: 'A', html: 'x'}],
    },
    errors.report,
    warnings.report,
  );
  assert.equal(deck?.baseCss, 'p{}');
  assert.deepEqual(errors.messages, []);
  assert.equal(warnings.messages.length, 1);
  assert.match(warnings.messages[0] ?? '', /boilerplate\.head/);
  assert.match(warnings.messages[0] ?? '', /version menu/);
});

test('parseDeck rejects a deck with no slides', () => {
  const {messages, report} = collector();
  assert.equal(parseDeck('../decks/d.json', {title: 'D', presets: []}, report), null);
  assert.match(messages.join('\n'), /presets/);
});

/* Version resolution ---------------------------------------------------- */

const CATALOG = {
  all: ['2.0.0-next.1', '1.21.0', '1.20.1', '1.19.4'],
  stable: ['1.21.0', '1.20.1', '1.19.4'],
  latest: '1.21.0',
  usedFallback: false,
};

test('chooseVersion resolves latest to the newest stable version', () => {
  assert.equal(chooseVersion('latest', CATALOG), '1.21.0');
  assert.equal(chooseVersion('', CATALOG), '1.21.0');
});

test('chooseVersion keeps a version the CDN lists', () => {
  assert.equal(chooseVersion('1.19.4', CATALOG), '1.19.4');
  assert.equal(chooseVersion('2.0.0-next.1', CATALOG), '2.0.0-next.1');
});

test('chooseVersion falls back to the newest stable for an unknown version', () => {
  assert.equal(chooseVersion('9.9.9', CATALOG), '1.21.0');
});

test('chooseVersion trusts the requested version when the catalog is the fallback list', () => {
  const offline = {...CATALOG, usedFallback: true};
  assert.equal(chooseVersion('1.5.0', offline), '1.5.0');
  assert.equal(chooseVersion('latest', offline), '1.21.0');
});

/* Presentation key routing ---------------------------------------------- */

const KEY = {altKey: false, ctrlKey: false, metaKey: false};

test('isTypingContext spots the editors and form controls', () => {
  assert.equal(isTypingContext(['div', 'playground-code-editor', 'body']), true);
  assert.equal(isTypingContext(['playground-file-editor']), true);
  assert.equal(isTypingContext(['input']), true);
  assert.equal(isTypingContext(['select', 'nys-select']), true);
  assert.equal(isTypingContext(['textarea']), true);
  assert.equal(isTypingContext(['nys-button', 'footer', 'body']), false);
});

test('routeKey steps the deck when the presenter is not typing', () => {
  assert.equal(routeKey({...KEY, key: 'ArrowRight'}, false), 'next');
  assert.equal(routeKey({...KEY, key: 'PageDown'}, false), 'next');
  assert.equal(routeKey({...KEY, key: ' '}, false), 'next');
  assert.equal(routeKey({...KEY, key: 'ArrowLeft'}, false), 'prev');
  assert.equal(routeKey({...KEY, key: 'Home'}, false), 'first');
  assert.equal(routeKey({...KEY, key: 'End'}, false), 'last');
  assert.equal(routeKey({...KEY, key: 'c'}, false), 'toggle-code');
  assert.equal(routeKey({...KEY, key: 'n'}, false), 'toggle-notes');
  assert.equal(routeKey({...KEY, key: 'Escape'}, false), 'exit');
});

test('routeKey leaves every plain key to the editor while typing', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', ' ', 'Home', 'End', 'c', 'n', 'Escape']) {
    assert.equal(routeKey({...KEY, key}, true), null, key);
  }
});

test('routeKey steps on Alt plus an arrow even while typing', () => {
  assert.equal(routeKey({...KEY, altKey: true, key: 'ArrowRight'}, true), 'next');
  assert.equal(routeKey({...KEY, altKey: true, key: 'ArrowDown'}, true), 'next');
  assert.equal(routeKey({...KEY, altKey: true, key: 'ArrowLeft'}, true), 'prev');
  assert.equal(routeKey({...KEY, altKey: true, key: 'ArrowUp'}, true), 'prev');
  assert.equal(routeKey({...KEY, altKey: true, key: 'c'}, true), null);
});

test('routeKey ignores browser and system shortcuts', () => {
  assert.equal(routeKey({...KEY, ctrlKey: true, key: 'ArrowRight'}, false), null);
  assert.equal(routeKey({...KEY, metaKey: true, key: 'ArrowRight'}, false), null);
});
