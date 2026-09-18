/**
 * Sanity checks for the pure helpers. Run them with `npm test`.
 *
 * These modules import nothing from the DOM, so Node can load them directly
 * with its built-in TypeScript type stripping.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {deckUrl, decodeState, encodeState, parseHash, presentUrl, slugify} from './state.ts';
import {hintText, isTypingContext, routeKey} from './keys.ts';
import {parseDeck, parsePreset} from './preset-schema.ts';
import {collapsedForPreset, layoutUrl, readLayoutParam} from './editors.ts';
import {createQuietDebounce} from './debounce.ts';
import {
  DEFAULTS,
  FONT_SIZES,
  UPDATE_DELAYS,
  clampRatio,
  readFontParam,
  readUpdateParam,
  settingUrl,
} from './settings.ts';
import {isBuildShortcut} from './keys.ts';
import {chooseVersion} from './version-catalog.ts';
import {otherTheme, readThemeParam, themeUrl} from './theme.ts';
import {resolveHeadUrls, wrapUserHtml} from './wrapper.ts';

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

test('wrapUserHtml puts the snippet in a whole document', () => {
  const userHtml = '<nys-button label="Save"></nys-button>';
  const wrapped = wrapUserHtml(userHtml, WRAPPER_OPTIONS);
  assert.ok(wrapped.startsWith('<!doctype html>'));
  assert.ok(wrapped.includes(userHtml));
  assert.ok(wrapped.includes(WRAPPER_OPTIONS.stylesHref));
  assert.ok(wrapped.includes(WRAPPER_OPTIONS.componentsSrc));
  assert.ok(wrapped.includes('./styles.css'));
  assert.ok(wrapped.includes('./script.js'));
});

test('wrapUserHtml leaves no editor pragmas behind', () => {
  // The wrapper used to live inside the HTML pane behind `playground-hide`
  // comments, which meant select-all copied it. It is its own hidden file now.
  const wrapped = wrapUserHtml('<p>Hi</p>', WRAPPER_OPTIONS);
  assert.ok(!wrapped.includes('playground-hide'));
  assert.ok(!wrapped.includes('nysds-playground:user-html'));
});

test('wrapUserHtml keeps multi-line markup and comments intact', () => {
  const userHtml = '<!-- a note -->\n<div>\n  <p>Line</p>\n</div>';
  assert.ok(wrapUserHtml(userHtml, WRAPPER_OPTIONS).includes(userHtml));
});

test('wrapUserHtml adds extra head markup when configured', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    ...WRAPPER_OPTIONS,
    extraHeadHtml: '<link rel="stylesheet" href="https://fonts.example.com/f.css" />',
  });
  assert.ok(wrapped.includes('https://fonts.example.com/f.css'));
});

test('resolveHeadUrls makes relative href and src values absolute', () => {
  const html =
    '<link rel="stylesheet" href="./fonts/nysds-fonts.css">' +
    "<script src='../x.js'></script>" +
    '<link href="https://cdn.example.com/a.css">';
  const resolved = resolveHeadUrls(html, 'https://example.org/playground/index.html');
  assert.ok(resolved.includes('href="https://example.org/playground/fonts/nysds-fonts.css"'));
  assert.ok(resolved.includes("src='https://example.org/x.js'"));
  assert.ok(resolved.includes('href="https://cdn.example.com/a.css"'));
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

test('wrapUserHtml injects the deck base CSS into the head', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    ...WRAPPER_OPTIONS,
    baseCss: 'body { padding: 2rem }',
  });
  assert.ok(wrapped.includes('<style>body { padding: 2rem }</style>'));
  assert.ok(wrapped.includes('<p>Hi</p>'));
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
    editors: null,
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

test('routeKey toggles the editor theme with t when not typing', () => {
  assert.equal(routeKey({...KEY, key: 't'}, false), 'toggle-theme');
  assert.equal(routeKey({...KEY, key: 'T'}, false), 'toggle-theme');
  assert.equal(routeKey({...KEY, key: 't'}, true), null);
});

test('readThemeParam accepts only light and dark', () => {
  assert.equal(readThemeParam('?theme=dark'), 'dark');
  assert.equal(readThemeParam('?present=1&theme=light'), 'light');
  assert.equal(readThemeParam('?theme=blue'), null);
  assert.equal(readThemeParam(''), null);
});

test('themeUrl sets the theme and keeps the rest of the URL', () => {
  const url = themeUrl('dark', 'http://localhost/?deck=a&present=1#preset=x');
  assert.equal(url, 'http://localhost/?deck=a&present=1&theme=dark#preset=x');
  assert.equal(otherTheme('dark'), 'light');
});

/* Editor layout and columns --------------------------------------------- */

test('parsePreset reads the editors field and drops bad entries', () => {
  const {messages, report} = collector();
  const preset = parsePreset(
    '../presets/01-button.json',
    {title: 'Button', html: 'x', editors: ['html', 'css', 'html', 'scss', 7]},
    'button',
    report,
  );
  assert.deepEqual(preset?.editors, ['html', 'css']);
  assert.equal(messages.length, 2);
  assert.match(messages.join('\n'), /"scss"/);
  assert.match(messages.join('\n'), /01-button\.json/);
});

test('parsePreset treats a missing editors field as "leave the columns alone"', () => {
  const preset = parsePreset('../presets/a.json', {title: 'A', html: 'x'}, 'a', () => {});
  assert.equal(preset?.editors, null);
});

test('parsePreset accepts an empty editors array', () => {
  const {messages, report} = collector();
  const preset = parsePreset('../presets/a.json', {title: 'A', html: 'x', editors: []}, 'a', report);
  assert.deepEqual(preset?.editors, []);
  assert.deepEqual(messages, []);
});

test('parsePreset reports an editors field that is not an array', () => {
  const {messages, report} = collector();
  const preset = parsePreset(
    '../presets/a.json',
    {title: 'A', html: 'x', editors: 'html'},
    'a',
    report,
  );
  assert.equal(preset?.editors, null);
  assert.match(messages.join('\n'), /"editors"/);
});

test('collapsedForPreset collapses whatever the slide leaves out', () => {
  assert.deepEqual([...(collapsedForPreset(['html', 'css']) ?? [])], ['js']);
  assert.deepEqual([...(collapsedForPreset([]) ?? [])], ['html', 'css', 'js']);
  assert.deepEqual([...(collapsedForPreset(['html', 'css', 'js']) ?? [])], []);
  assert.equal(collapsedForPreset(null), null);
});

test('readLayoutParam and layoutUrl handle the editors query parameter', () => {
  assert.equal(readLayoutParam('?editors=columns'), 'columns');
  assert.equal(readLayoutParam('?editors=tabs'), 'tabs');
  assert.equal(readLayoutParam('?editors=grid'), null);
  assert.equal(readLayoutParam(''), null);
  assert.equal(
    layoutUrl('columns', 'https://example.com/?deck=d&theme=dark#preset=p'),
    'https://example.com/?deck=d&theme=dark&editors=columns#preset=p',
  );
});

test('routeKey toggles the layout with e from anywhere but the editor', () => {
  assert.equal(routeKey({...KEY, key: 'e'}, false), 'toggle-layout');
  assert.equal(routeKey({...KEY, key: 'E'}, false), 'toggle-layout');
  assert.equal(routeKey({...KEY, key: 'e'}, true), null);
});

test('routeKey maps 1, 2, and 3 to columns only in the columns layout', () => {
  assert.equal(routeKey({...KEY, key: '1'}, false, true), 'toggle-pane:html');
  assert.equal(routeKey({...KEY, key: '2'}, false, true), 'toggle-pane:css');
  assert.equal(routeKey({...KEY, key: '3'}, false, true), 'toggle-pane:js');
  assert.equal(routeKey({...KEY, key: '4'}, false, true), null);
  assert.equal(routeKey({...KEY, key: '1'}, false, false), null);
  assert.equal(routeKey({...KEY, key: '1'}, true, true), null);
});

test('hintText names the column shortcuts only in the columns layout', () => {
  const tabs = hintText(true, false);
  assert.ok(tabs.includes('e layout'));
  assert.ok(!tabs.includes('1 2 3 panes'));
  const columns = hintText(false, true);
  assert.ok(columns.includes('1 2 3 panes'));
  assert.ok(!columns.includes('n notes'));
});

/* Settings --------------------------------------------------------------- */

test('readFontParam and readUpdateParam accept only known values', () => {
  assert.equal(readFontParam('?font=small'), 'small');
  assert.equal(readFontParam('?font=medium'), 'medium');
  assert.equal(readFontParam('?font=large'), 'large');
  assert.equal(readFontParam('?font=huge'), null);
  assert.equal(readFontParam(''), null);

  assert.equal(readUpdateParam('?update=typing'), 'typing');
  assert.equal(readUpdateParam('?update=pause'), 'pause');
  assert.equal(readUpdateParam('?update=manual'), 'manual');
  assert.equal(readUpdateParam('?update=never'), null);
  assert.equal(readUpdateParam('?theme=dark'), null);
});

test('the editor layout defaults to the side-by-side columns', () => {
  assert.equal(DEFAULTS.layout, 'columns');
  // A stored choice still wins over the default.
  assert.equal(readLayoutParam('?editors=tabs'), 'tabs');
});

test('the editor theme defaults to dark', () => {
  assert.equal(DEFAULTS.theme, 'dark');
  assert.equal(readThemeParam('?theme=light'), 'light');
});

test('the font sizes and update delays are the documented ones', () => {
  assert.deepEqual(FONT_SIZES, {small: '13px', medium: '15px', large: '18px'});
  assert.deepEqual(UPDATE_DELAYS, {typing: 800, pause: 2000, manual: null});
});

test('clampRatio keeps a pane inside its range', () => {
  assert.equal(clampRatio(50, 15, 85), 50);
  assert.equal(clampRatio(2, 15, 85), 15);
  assert.equal(clampRatio(99, 15, 85), 85);
  assert.equal(clampRatio(Number.NaN, 15, 85), 15);
});

test('settingUrl sets one parameter and keeps the rest of the URL', () => {
  assert.equal(
    settingUrl('font', 'large', 'https://example.com/?deck=d&theme=dark#preset=p'),
    'https://example.com/?deck=d&theme=dark&font=large#preset=p',
  );
});

test('isBuildShortcut matches Cmd/Ctrl plus Enter or S only', () => {
  assert.equal(isBuildShortcut({key: 'Enter', altKey: false, ctrlKey: true, metaKey: false}), true);
  assert.equal(isBuildShortcut({key: 'Enter', altKey: false, ctrlKey: false, metaKey: true}), true);
  assert.equal(isBuildShortcut({key: 's', altKey: false, ctrlKey: false, metaKey: true}), true);
  assert.equal(isBuildShortcut({key: 'S', altKey: false, ctrlKey: true, metaKey: false}), true);
  assert.equal(isBuildShortcut({key: 'Enter', altKey: false, ctrlKey: false, metaKey: false}), false);
  assert.equal(isBuildShortcut({key: 'a', altKey: false, ctrlKey: true, metaKey: false}), false);
});

/* Preview rebuild debounce ----------------------------------------------- */

/** A clock whose time only moves when a test says so. */
function fakeClock() {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, {at: number; handler: () => void}>();
  return {
    clock: {
      setTimeout(handler: () => void, delay: number): number {
        const handle = nextHandle++;
        timers.set(handle, {at: now + delay, handler});
        return handle;
      },
      clearTimeout(handle: number): void {
        timers.delete(handle);
      },
    },
    advance(ms: number): void {
      now += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(handle);
          timer.handler();
        }
      }
    },
  };
}

test('the debounce waits for a pause instead of firing on every edit', () => {
  const {clock, advance} = fakeClock();
  let builds = 0;
  const build = createQuietDebounce(() => builds++, 800, clock);

  build.schedule();
  advance(400);
  build.schedule();
  advance(400);
  assert.equal(builds, 0, 'a steady stream of edits must not rebuild');
  assert.equal(build.pending, true);

  advance(800);
  assert.equal(builds, 1, 'the pause rebuilds once');
  assert.equal(build.pending, false);
});

test('the debounce never fires on its own when the delay is null', () => {
  const {clock, advance} = fakeClock();
  let builds = 0;
  const build = createQuietDebounce(() => builds++, null, clock);

  build.schedule();
  advance(10000);
  assert.equal(builds, 0);
  assert.equal(build.pending, true);

  build.flush();
  assert.equal(builds, 1);
  assert.equal(build.pending, false);
});

test('changing the delay reschedules a waiting build', () => {
  const {clock, advance} = fakeClock();
  let builds = 0;
  const build = createQuietDebounce(() => builds++, 800, clock);

  build.schedule();
  advance(500);
  build.setDelay(2000);
  advance(1000);
  assert.equal(builds, 0, 'the longer pause has not elapsed yet');
  advance(1100);
  assert.equal(builds, 1);
});

test('cancel drops a waiting build without running it', () => {
  const {clock, advance} = fakeClock();
  let builds = 0;
  const build = createQuietDebounce(() => builds++, 800, clock);
  build.schedule();
  build.cancel();
  advance(5000);
  assert.equal(builds, 0);
  assert.equal(build.pending, false);
});
