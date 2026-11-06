/**
 * Reads short status messages to screen readers.
 *
 * `#announcer` in `index.html` is a polite live region that is always in the
 * page and never hidden. Use it for the result of an action that has no other
 * spoken feedback, such as a slide change from the arrow keys. Keep messages
 * to one short sentence, and don't announce anything the person didn't ask
 * for.
 */

let pending: number | undefined;

/** Queues a message for screen readers, even when it repeats the last one. */
export function announce(text: string): void {
  const region = document.querySelector<HTMLElement>('#announcer');
  if (!region) {
    return;
  }
  // Clear the region first, then fill it on the next frame, so a repeated
  // message still counts as a change.
  region.textContent = '';
  if (pending !== undefined) {
    window.cancelAnimationFrame(pending);
  }
  pending = window.requestAnimationFrame(() => {
    pending = undefined;
    region.textContent = text;
  });
}
