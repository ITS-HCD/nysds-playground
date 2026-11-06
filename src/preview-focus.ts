/**
 * Keeps keyboard focus in the preview clear of the code drawer.
 *
 * The drawer floats over the bottom of the preview, so a button or field near
 * the bottom of a slide can take focus behind it, where you can't see it
 * (WCAG 2.4.11). The preview is a cross-origin iframe, so the app can't
 * scroll it. Instead, the hidden wrapper carries {@link PREVIEW_FOCUS_SCRIPT},
 * and {@link coverPreview} posts it how much of the frame the drawer covers
 * whenever that changes.
 *
 * Inside the preview, the script does three things:
 *
 * - It sets `scroll-padding-bottom` on the root, so the browser's own focus
 *   scrolling stops above the drawer instead of at the bottom edge.
 * - After keyboard focus moves, it scrolls the focused element up if it still
 *   sits behind the drawer, and again whenever the drawer changes size.
 * - When a slide can't scroll that far, as when it fits the frame exactly, it
 *   adds empty room past the end of the document. The room is out of flow, so
 *   nothing on the slide moves, and it goes away when focus leaves the
 *   preview.
 *
 * Until something in the preview has keyboard focus, the slide looks exactly
 * as it would without the script. With the drawer hidden, nothing changes.
 *
 * The pure helpers here have no DOM dependency, so `src/preview-focus.test.ts`
 * covers them under `node --test`.
 */

/** The `type` of every message the app posts to the preview. */
export const COVER_MESSAGE = 'nysds-playground:cover';

/**
 * The gap to keep between a focused element and the drawer, in CSS pixels.
 *
 * It leaves room for the focus ring, which sits outside the element's box, and
 * for the drawer's shadow.
 */
export const FOCUS_MARGIN = 16;

/** What the app tells the preview about the drawer. */
export interface CoverMessage {
  type: typeof COVER_MESSAGE;
  /** How far the drawer reaches up from the bottom of the frame. */
  covered: number;
  /**
   * The frame's height, in the same pixels as `covered`.
   *
   * The preview divides its own viewport height by this to convert `covered`
   * into its own CSS pixels, in case the two pages are zoomed differently.
   */
  height: number;
  /** Whether the preview holds the page's focus. */
  focused: boolean;
}

/** The vertical extent of a box, as `getBoundingClientRect` reports it. */
export interface VerticalBox {
  top: number;
  bottom: number;
}

/**
 * Returns how many pixels of a frame the drawer covers.
 *
 * Pass `null` for `drawerTop` when the drawer is hidden.
 */
export function coveredHeight(frame: VerticalBox, drawerTop: number | null): number {
  if (drawerTop === null || frame.bottom <= frame.top) {
    return 0;
  }
  const top = Math.max(drawerTop, frame.top);
  return Math.max(0, frame.bottom - top);
}

/**
 * Returns how far to scroll down so a focused element clears the drawer, or 0
 * when it already does.
 *
 * `outer` is the focused element in the document, such as `<nys-textinput>`,
 * and `inner` is the element that holds focus inside its shadow root, such as
 * the native `<input>`. Revealing `outer` shows the whole control, label and
 * error message included. When `outer` is too tall to fit above the drawer,
 * `inner`, where the focus ring is, is revealed instead.
 *
 * The scroll stops short of pushing the element's top edge out of view.
 */
export function revealDelta(
  outer: VerticalBox,
  inner: VerticalBox,
  viewport: number,
  covered: number,
  margin: number,
): number {
  if (covered <= 0) {
    return 0;
  }
  // The lowest an element's bottom edge may sit.
  const floor = viewport - covered - margin;
  const box = outer.bottom - outer.top <= floor - margin ? outer : inner;
  if (box.bottom <= floor) {
    return 0;
  }
  return Math.max(0, Math.min(box.bottom - floor, box.top - margin));
}

/**
 * Runs inside the preview, as the first script in its `<head>`.
 *
 * It is serialized with `Function.prototype.toString`, so it must not refer
 * to anything outside its own body: everything it needs comes in through its
 * parameters. It defines no globals, adds no elements, and touches no inline
 * styles. Its CSS lives in a constructed stylesheet, so user code that reads
 * the DOM or the document's stylesheets never sees it, and every selector is
 * wrapped in `:where()`, so the user's own CSS wins any conflict.
 */
function guardPreviewFocus(type: string, margin: number, reveal: typeof revealDelta): void {
  if (!('adoptedStyleSheets' in document)) {
    return;
  }
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  /** How far the drawer reaches up the viewport, in this page's pixels. */
  let covered = 0;
  /** Where the extra room starts, or -1 while there is none. */
  let roomStart = -1;
  /** Whether to hide the scrollbar that only the extra room creates. */
  let hideBar = false;

  const paint = (): void => {
    let css = '';
    if (covered > 0) {
      css = `:where(html){scroll-padding-bottom:${covered + margin}px}`;
      if (roomStart >= 0) {
        css +=
          `:where(html)::after{content:"";position:absolute;top:${roomStart}px;left:0;` +
          `width:1px;height:${covered + margin}px;visibility:hidden;pointer-events:none}`;
        if (hideBar) {
          css += ':where(html){scrollbar-width:none}';
        }
      }
    }
    sheet.replaceSync(css);
  };

  const check = (smooth: boolean): void => {
    if (covered <= 0 || !document.hasFocus()) {
      return;
    }
    const outer = document.activeElement;
    if (!outer || outer === document.body || outer === document.documentElement) {
      return;
    }
    let inner: Element = outer;
    while (inner.shadowRoot?.activeElement) {
      inner = inner.shadowRoot.activeElement;
    }
    // Only keyboard focus moves the slide. A pointer press focuses what you
    // can already see, and scrolling under the pointer could miss the click.
    try {
      if (!inner.matches(':focus-visible')) {
        return;
      }
    } catch {
      // A browser without :focus-visible treats every focus as visible.
    }
    const delta = reveal(
      outer.getBoundingClientRect(),
      inner.getBoundingClientRect(),
      window.innerHeight,
      covered,
      margin,
    );
    if (delta <= 0) {
      return;
    }
    // Content pinned to the viewport, such as an open modal dialog, stays put
    // when the slide scrolls, so scrolling would only move the slide behind
    // it. Walk up through slots and shadow roots to find out.
    for (let node: Node | null = inner; node; ) {
      if (node instanceof Element && getComputedStyle(node).position === 'fixed') {
        return;
      }
      node = (node as Element).assignedSlot ?? node.parentNode ?? (node as ShadowRoot).host ?? null;
    }
    const root = document.scrollingElement ?? document.documentElement;
    if (roomStart < 0 && delta > root.scrollHeight - root.clientHeight - root.scrollTop) {
      hideBar = root.scrollHeight <= root.clientHeight;
      roomStart = root.scrollHeight;
      paint();
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({top: delta, behavior: smooth && !still ? 'smooth' : 'instant'});
  };

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as Partial<CoverMessage> | null;
    if (event.source !== window.parent || !data || data.type !== type) {
      return;
    }
    const height = Number(data.height);
    const scale = height > 0 ? window.innerHeight / height : 1;
    covered = Math.max(0, Number(data.covered) * scale || 0);
    // Focus has left the preview, or nothing covers it, so the slide goes
    // back to the way it looks on its own. A "left" message that crossed a
    // Tab back into the preview is stale, so this page's own focus decides.
    if (covered <= 0 || (data.focused === false && !document.hasFocus())) {
      roomStart = -1;
    }
    paint();
    check(false);
  });
  // Wait a frame, so the browser's own focus scrolling has finished.
  document.addEventListener('focusin', () => {
    window.requestAnimationFrame(() => check(true));
  });
}

/** The script the wrapper puts first in the preview's `<head>`. */
export const PREVIEW_FOCUS_SCRIPT = `(${guardPreviewFocus.toString()})(${JSON.stringify(
  COVER_MESSAGE,
)},${FOCUS_MARGIN},${revealDelta.toString()});`;

/** The `playground-elements` preview, as far as this module needs it. */
type PreviewElement = HTMLElement & {updateComplete?: Promise<unknown>};

/**
 * Tells the preview how much of it the drawer covers, now and whenever that
 * changes.
 *
 * The covered height changes when the drawer opens, closes, or is resized, and
 * when the stage changes size, as it does in presentation mode and when the
 * window resizes. Watching the stage and the drawer catches every one of
 * those, whatever caused it. A rebuild reloads the preview, which starts it
 * from nothing, so each load gets the current value too. Whether the preview
 * holds focus goes along, so the preview can drop its extra room once focus
 * leaves.
 */
export function coverPreview(
  preview: PreviewElement,
  stage: HTMLElement,
  drawer: HTMLElement,
  divider: HTMLElement,
): void {
  let frame: HTMLIFrameElement | null = null;
  let last = '';

  const send = (always = false): void => {
    frame ??= preview.shadowRoot?.querySelector('iframe') ?? null;
    const target = frame?.contentWindow;
    if (!frame || !target) {
      return;
    }
    let origin: string;
    try {
      origin = new URL(frame.src).origin;
    } catch {
      return;
    }
    const box = frame.getBoundingClientRect();
    if (origin === 'null' || box.height <= 0) {
      return;
    }
    // A hidden drawer has no boxes. The divider sits on the drawer's top edge.
    const shown = drawer.getClientRects().length > 0;
    const message: CoverMessage = {
      type: COVER_MESSAGE,
      covered: coveredHeight(box, shown ? divider.getBoundingClientRect().top : null),
      height: box.height,
      focused: document.activeElement === preview,
    };
    const key = `${message.covered}|${message.height}|${message.focused}`;
    if (!always && key === last) {
      return;
    }
    last = key;
    target.postMessage(message, origin);
  };

  const observer = new ResizeObserver(() => send());
  observer.observe(stage);
  observer.observe(drawer);
  // Focus moving into or out of the preview.
  document.addEventListener('focusin', () => send(), true);
  window.addEventListener('blur', () => send());

  const attach = (): void => {
    frame = preview.shadowRoot?.querySelector('iframe') ?? null;
    frame?.addEventListener('load', () => send(true));
    send(true);
  };
  if (preview.updateComplete) {
    void preview.updateComplete.then(attach);
  } else {
    attach();
  }
}
