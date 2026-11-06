/**
 * Closes a modal from a click outside it, unless that would lose changes.
 *
 * `nys-modal` closes from its close button and from Escape, and ignores a
 * click on the backdrop. The playground adds the backdrop click and holds it
 * and Escape to one rule: a modal with nothing to lose closes, and a modal
 * holding changes that only Done applies stays open and moves focus to Done.
 * The close button keeps working either way, so it stays the deliberate way
 * to throw changes away.
 */

type Modal = HTMLElement & {open?: boolean};

export interface DismissOptions {
  /** Whether the modal holds changes that only Done applies. Omit when it never does. */
  isDirty?: () => boolean;
  /** The button that applies the changes. It takes focus when a dismissal is refused. */
  done?: HTMLElement;
  /**
   * What an outside click does to a modal with nothing to lose. Closing it is
   * the default; pass the modal's Cancel when closing has to tidy up too.
   */
  dismiss?: () => void;
}

const guarded = new Map<Modal, DismissOptions>();

/** Applies the outside-click and Escape rule to one modal. */
export function guardDismissal(modal: Modal, options: DismissOptions = {}): void {
  if (guarded.size === 0) {
    // Capture on the window runs before the modal's own Escape handling,
    // wherever focus is when the key goes down.
    window.addEventListener('keydown', onKeyDown, true);
  }
  guarded.set(modal, options);

  // Both ends of the click have to land outside, so selecting text in a field
  // and letting go over the backdrop does not count as a click outside.
  let pressedOutside = false;
  modal.addEventListener('pointerdown', (event) => {
    pressedOutside = event.button === 0 && isOutside(modal, event);
  });
  modal.addEventListener('click', (event) => {
    const outside = pressedOutside && event.detail > 0 && isOutside(modal, event);
    pressedOutside = false;
    if (!outside || modal.open !== true) {
      return;
    }
    if (options.isDirty?.()) {
      refuse(options);
      return;
    }
    if (options.dismiss) {
      options.dismiss();
    } else {
      modal.open = false;
    }
  });
}

/** Keeps Escape from closing a modal that holds changes. */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    return;
  }
  for (const [modal, options] of guarded) {
    if (modal.open === true && options.isDirty?.()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      refuse(options);
      return;
    }
  }
}

/** Points at Done, the way out that keeps the changes. */
function refuse(options: DismissOptions): void {
  // `focusVisible` shows the focus ring even after a pointer click, in the
  // browsers that support it.
  options.done?.focus({focusVisible: true} as FocusOptions);
}

/** What the dialog box itself is: a `dialog` element or `role="dialog"`. */
const SURFACE = 'dialog, [role="dialog"]';

/**
 * Whether a pointer event landed outside the dialog box.
 *
 * It compares the pointer with the box rather than trusting the event's
 * target: a press on the backdrop that lets go inside the box fires its click
 * on an element both share, and a native dialog's backdrop sends its clicks to
 * the dialog element.
 */
function isOutside(modal: Modal, event: MouseEvent): boolean {
  const surface =
    event
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node !== modal && node.matches(SURFACE),
      ) ?? modal.shadowRoot?.querySelector<HTMLElement>(SURFACE);
  if (!surface) {
    return true;
  }
  const box = surface.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}
