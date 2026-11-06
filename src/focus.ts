/**
 * Small helpers for moving keyboard focus around the shell.
 */

/** A design system element, which renders after it is added to the page. */
type Rendered = HTMLElement & {updateComplete?: Promise<unknown>};

/** Whether an element can hold focus right now: shown and not disabled. */
export function usable(element: HTMLElement & {disabled?: boolean}): boolean {
  return element.isConnected && element.disabled !== true && element.getClientRects().length > 0;
}

/**
 * Focuses a design system element once it has rendered.
 *
 * `nys-button` hands focus to the `button` inside it, which only exists after
 * its first render, so focusing it any sooner does nothing.
 */
export async function focusWhenReady(host: Rendered): Promise<void> {
  await host.updateComplete;
  host.focus();
}

/** Where focus was, so it can go back there. */
export interface RememberedFocus {
  /**
   * Focuses the remembered element again, if it can still take focus. When
   * it can't, or nothing in particular had focus, it calls `fallback`.
   */
  restore(fallback?: () => void): void;
}

/** Remembers which element has focus now. */
export function rememberFocus(): RememberedFocus {
  const opener = document.activeElement;
  return {
    restore(fallback) {
      if (opener instanceof HTMLElement && opener !== document.body && usable(opener)) {
        opener.focus();
      } else {
        fallback?.();
      }
    },
  };
}
