/**
 * Text for screen readers: short status messages, and words that stand in
 * for what sighted users see.
 *
 * `#announcer` in `index.html` is a polite live region that is always in the
 * page and never hidden. Use it for the result of an action that has no other
 * spoken feedback, such as a slide change from the arrow keys. Keep messages
 * to one short sentence, and don't announce anything the person didn't ask
 * for.
 */

/** The next frame's message for each live region, so a newer one wins. */
const pending = new Map<HTMLElement, number>();

/**
 * Queues a message for screen readers, even when it repeats the last one.
 *
 * It goes to `#announcer` unless `region` names another live region, such as
 * one inside a modal, where a region outside it isn't read.
 */
export function announce(
  text: string,
  region = document.querySelector<HTMLElement>('#announcer'),
): void {
  if (!region) {
    return;
  }
  // Clear the region first, then fill it on the next frame, so a repeated
  // message still counts as a change.
  region.textContent = '';
  const frame = pending.get(region);
  if (frame !== undefined) {
    window.cancelAnimationFrame(frame);
  }
  pending.set(
    region,
    window.requestAnimationFrame(() => {
      pending.delete(region);
      region.textContent = text;
    }),
  );
}

/** Builds a span that only screen readers read, as in a button's full name. */
export function visuallyHidden(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'visually-hidden';
  span.textContent = text;
  return span;
}
