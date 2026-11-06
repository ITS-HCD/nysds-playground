/**
 * Checks the logic that keeps keyboard focus in the preview clear of the code
 * drawer. Run it with `npm test`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COVER_MESSAGE,
  FOCUS_MARGIN,
  PREVIEW_FOCUS_SCRIPT,
  coveredHeight,
  revealDelta,
} from './preview-focus.ts';
import {wrapUserHtml} from './wrapper.ts';

const box = (top: number, bottom: number) => ({top, bottom});

test('coveredHeight measures from the drawer top to the frame bottom', () => {
  assert.equal(coveredHeight(box(0, 800), 560), 240);
  // The frame starts below the page top, as it does under the toolbar.
  assert.equal(coveredHeight(box(64, 864), 600), 264);
});

test('coveredHeight is 0 when the drawer is hidden or below the frame', () => {
  assert.equal(coveredHeight(box(0, 800), null), 0);
  assert.equal(coveredHeight(box(0, 800), 800), 0);
  assert.equal(coveredHeight(box(0, 800), 900), 0);
  // A frame with no height has nothing to cover.
  assert.equal(coveredHeight(box(0, 0), 0), 0);
});

test('coveredHeight never reports more than the whole frame', () => {
  assert.equal(coveredHeight(box(100, 800), 40), 700);
});

test('revealDelta leaves alone an element that clears the drawer', () => {
  // Viewport 800, drawer covers 240, so the lowest bottom edge is 544.
  assert.equal(revealDelta(box(500, 540), box(500, 540), 800, 240, 16), 0);
  assert.equal(revealDelta(box(500, 544), box(500, 544), 800, 240, 16), 0);
});

test('revealDelta scrolls an element out from behind the drawer', () => {
  assert.equal(revealDelta(box(700, 740), box(700, 740), 800, 240, 16), 196);
  // Partly covered.
  assert.equal(revealDelta(box(530, 570), box(530, 570), 800, 240, 16), 26);
  // Entirely below the viewport.
  assert.equal(revealDelta(box(900, 940), box(900, 940), 800, 240, 16), 396);
});

test('revealDelta also clears the margin above the drawer', () => {
  // The element ends 4px above the drawer, so its focus ring would touch it.
  assert.equal(revealDelta(box(516, 556), box(516, 556), 800, 240, 16), 12);
});

test('revealDelta does nothing with the drawer hidden', () => {
  assert.equal(revealDelta(box(780, 820), box(780, 820), 800, 0, 16), 0);
});

test('revealDelta reveals the whole control when it fits', () => {
  // A text input whose label sits above the native field.
  const outer = box(560, 680);
  const inner = box(600, 640);
  assert.equal(revealDelta(outer, inner, 800, 240, 16), 136);
});

test('revealDelta falls back to the focused part of a control too tall to fit', () => {
  // The control is taller than the 528px above the drawer, less the margins.
  const outer = box(100, 700);
  const inner = box(600, 640);
  assert.equal(revealDelta(outer, inner, 800, 240, 16), 96);
});

test('revealDelta never pushes the top edge out of view', () => {
  // A focused element taller than the room above the drawer lines up its top
  // with the margin instead.
  const tall = box(300, 900);
  assert.equal(revealDelta(tall, tall, 800, 240, 16), 284);
  // Already at the top: nothing to gain by scrolling.
  const top = box(10, 900);
  assert.equal(revealDelta(top, top, 800, 240, 16), 0);
});

test('PREVIEW_FOCUS_SCRIPT is a self-contained script', () => {
  // It parses as a classic script, so serializing the functions kept them
  // whole.
  assert.doesNotThrow(() => new Function(PREVIEW_FOCUS_SCRIPT));
  // It can sit inside a <script> element.
  assert.ok(!/<\/script/i.test(PREVIEW_FOCUS_SCRIPT));
  assert.ok(PREVIEW_FOCUS_SCRIPT.includes(JSON.stringify(COVER_MESSAGE)));
  assert.ok(PREVIEW_FOCUS_SCRIPT.includes(`,${FOCUS_MARGIN},`));
});

test('wrapUserHtml runs the head script before any stylesheet or module', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    stylesHref: 'https://cdn.example.com/styles.css',
    componentsSrc: 'https://cdn.example.com/components.js',
    headScript: PREVIEW_FOCUS_SCRIPT,
  });
  const script = wrapped.indexOf(`<script>${PREVIEW_FOCUS_SCRIPT}</script>`);
  assert.ok(script > 0);
  assert.ok(script < wrapped.indexOf('<link rel="stylesheet"'));
  assert.ok(script < wrapped.indexOf('<script type="module"'));
});

test('wrapUserHtml adds no head script unless asked', () => {
  const wrapped = wrapUserHtml('<p>Hi</p>', {
    stylesHref: 'https://cdn.example.com/styles.css',
    componentsSrc: 'https://cdn.example.com/components.js',
  });
  assert.ok(!wrapped.includes('<script>'));
});
