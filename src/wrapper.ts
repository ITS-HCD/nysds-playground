/**
 * Builds the preview document that wraps the user's markup.
 *
 * The wrapper is a file of its own, hidden from the editors, so the HTML pane
 * holds nothing but the user's snippet. That keeps select-all and copy honest
 * and the line numbers correct.
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
   * It goes into the head as a `<style>`, so it styles the preview without
   * taking up room in the CSS tab.
   */
  baseCss?: string;
  /** The `<title>` of the preview document. */
  title?: string;
}

/**
 * Wraps the user's markup in a complete HTML document.
 *
 * The result is never shown in an editor, so it is written for the browser
 * rather than for reading.
 */
export function wrapUserHtml(userHtml: string, options: WrapperOptions): string {
  const title = options.title ?? 'Preview';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtmlText(title)}</title>`,
    `<link rel="stylesheet" href="${options.stylesHref}">`,
    // The design system reset removes the body margin. Put the browser default
    // back so a lone button doesn't sit against the edge. Deck base CSS and the
    // CSS tab load later, so either can set `body { margin: 0 }` to remove it.
    '<style>body{margin:8px}</style>',
    options.extraHeadHtml ?? '',
    options.baseCss ? `<style>${options.baseCss}</style>` : '',
    '<link rel="stylesheet" href="./styles.css">',
    `<script type="module" src="${options.componentsSrc}"></script>`,
  ].join('');
  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head>${head}</head>`,
    '<body>',
    userHtml,
    '<script type="module" src="./script.js"></script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Rewrites relative `href` and `src` values in head markup to absolute URLs.
 *
 * The preview runs on a different origin from the playground, so a link
 * written relative to the playground page, such as `./fonts/nysds-fonts.css`,
 * has to be resolved against the page before it goes into the preview.
 */
export function resolveHeadUrls(html: string, baseUrl: string): string {
  return html.replace(
    /\b(href|src)=(["'])(\.{1,2}\/[^"']*)\2/g,
    (_match, attr: string, quote: string, value: string) =>
      `${attr}=${quote}${new URL(value, baseUrl).href}${quote}`,
  );
}

/** Escapes text that goes into an HTML text node. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
