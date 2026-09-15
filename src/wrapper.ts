/**
 * Builds the hidden `index.html` wrapper that the preview renders, and splits
 * the user's markup back out of it.
 *
 * The wrapper has no imports on purpose, so `src/state.test.ts` can load it
 * directly under `node --test`.
 */

/** The options that vary between wrappers. */
export interface WrapperOptions {
  /** The absolute URL of the design system stylesheet. */
  stylesHref: string;
  /** The absolute URL of the design system component bundle. */
  componentsSrc: string;
  /** Extra markup to append to the `<head>`. */
  extraHeadHtml?: string;
  /**
   * CSS that applies to every slide in a deck.
   *
   * It goes into the hidden head as a `<style>`, so it styles the preview
   * without taking up room in the CSS tab.
   */
  baseCss?: string;
  /** The `<title>` of the preview document. */
  title?: string;
}

/** Marks the start of the editable region. Playground hides this comment. */
const START_MARKER = '<!-- nysds-playground:user-html -->';

/** Marks the end of the editable region. Playground hides this comment. */
const END_MARKER = '<!-- /nysds-playground:user-html -->';

/**
 * The exact text that precedes the user's markup inside `index.html`.
 *
 * The whole hidden prefix sits on one line. Playground's pragma handling
 * collapses a hidden region and the newline that follows it into a single
 * display line, so a one-line prefix keeps the editor's line numbers
 * contiguous from the first line of the user's markup.
 */
const OPEN_BOUNDARY = `${START_MARKER}<!-- playground-hide-end -->\n`;

/** The exact text that follows the user's markup inside `index.html`. */
const CLOSE_BOUNDARY = `\n<!-- playground-hide -->${END_MARKER}`;

/**
 * Wraps the user's markup in a complete HTML document.
 *
 * Everything outside the `<!-- playground-hide -->` regions is what the HTML
 * editor shows, so the editor only ever displays the user's own markup.
 */
export function wrapUserHtml(userHtml: string, options: WrapperOptions): string {
  const title = options.title ?? 'Preview';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtmlText(title)}</title>`,
    `<link rel="stylesheet" href="${options.stylesHref}">`,
    options.extraHeadHtml ?? '',
    options.baseCss ? `<style>${options.baseCss}</style>` : '',
    '<link rel="stylesheet" href="./styles.css">',
    `<script type="module" src="${options.componentsSrc}"></script>`,
  ].join('');
  const prefix =
    `<!-- playground-hide --><!doctype html><html lang="en">` +
    `<head>${head}</head><body>`;
  const suffix =
    `<script type="module" src="./script.js"></script></body></html>` +
    `<!-- playground-hide-end -->\n`;
  return `${prefix}${OPEN_BOUNDARY}${userHtml}${CLOSE_BOUNDARY}${suffix}`;
}

/**
 * Returns the user's markup from a wrapped `index.html`.
 *
 * Returns `null` when the markers are missing, which happens only if an edit
 * deletes them. Callers keep the previous markup in that case.
 */
export function splitUserHtml(content: string): string | null {
  const start = content.indexOf(OPEN_BOUNDARY);
  if (start === -1) {
    return null;
  }
  const from = start + OPEN_BOUNDARY.length;
  const end = content.indexOf(CLOSE_BOUNDARY, from);
  if (end === -1) {
    return null;
  }
  return content.slice(from, end);
}

/** Escapes text that goes into an HTML text node. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
