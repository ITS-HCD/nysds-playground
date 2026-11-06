/**
 * The playground's rules for `nys-modal`, in one place.
 *
 * - Dismissal: `nys-modal` closes from its close button and from Escape, and
 *   ignores a click on the backdrop. The playground adds the backdrop click
 *   and holds it and Escape to one rule: a modal with nothing to lose closes,
 *   and a modal holding changes that only Done applies stays open and moves
 *   focus to Done. The close button keeps working either way, so it stays the
 *   deliberate way to throw changes away.
 * - Shift+Tab: `nys-modal` 1.21.0 handles Shift+Tab itself, and from most of
 *   the controls in its body it goes to the wrong place. See `repairShiftTab`.
 * - Questions: the confirm and leave modals ask one question at a time. See
 *   `ModalQuestion`.
 */

/** A design system modal. */
export type Modal = HTMLElement & {open?: boolean};

/** Returns the modal that matches `selector`. */
export function modal(selector: string): Modal {
  const element = document.querySelector<Modal>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}

/**
 * Reports whether any design system modal is on screen.
 *
 * It reads the `open` property rather than the attribute: the attribute only
 * lands on the component's next render, which is a frame too late for a key
 * handler.
 */
export function anyModalOpen(): boolean {
  return [...document.querySelectorAll<Modal>('nys-modal')].some((each) => each.open === true);
}

/* Keyboard ------------------------------------------------------------- */

/**
 * Installs the Shift+Tab fix and the Escape rule for every modal. Call it
 * once, at start-up.
 *
 * Capture on the window runs before the modal's own key handling, wherever
 * focus is when the key goes down, and before the slide bar's shortcuts.
 */
export function bindModalKeys(): void {
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') {
        repairShiftTab(event);
      } else if (event.key === 'Escape') {
        guardEscape(event);
      }
    },
    true,
  );
}

/**
 * Lets Shift+Tab move backward through a modal's fields.
 *
 * `nys-modal` 1.21.0 handles Shift+Tab itself, and from most of the controls
 * in its body it goes to the wrong place: from a `nys-textinput`,
 * `nys-select`, or `nys-toggle` it jumps to the last button, it skips those
 * fields on the way back between buttons, and next to a disabled button it
 * doesn't move at all. Forward Tab, and Shift+Tab from the modal's own close
 * button, work.
 *
 * So Shift+Tab from the modal's content is left to the browser, which moves
 * to the previous control in order and reaches the close button from the
 * first one. From the close button on, the modal wraps focus as it should.
 * Remove this once `nys-modal` moves backward correctly on its own.
 */
function repairShiftTab(event: KeyboardEvent): void {
  if (!event.shiftKey || event.defaultPrevented) {
    return;
  }
  // At the window, the target is the topmost element in the document, so
  // focus inside a field in the modal's body reports that field, while focus
  // on the modal's own close button reports the modal.
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.tagName === 'NYS-MODAL') {
    return;
  }
  if (target.closest<Modal>('nys-modal')?.open === true) {
    event.stopImmediatePropagation();
  }
}

/** Keeps Escape from closing a modal that holds changes. */
function guardEscape(event: KeyboardEvent): void {
  for (const [guardedModal, options] of guarded) {
    if (guardedModal.open === true && options.isDirty?.()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      refuse(options);
      return;
    }
  }
}

/* Outside click -------------------------------------------------------- */

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
export function guardDismissal(target: Modal, options: DismissOptions = {}): void {
  guarded.set(target, options);

  // Both ends of the click have to land outside, so selecting text in a field
  // and letting go over the backdrop does not count as a click outside.
  let pressedOutside = false;
  target.addEventListener('pointerdown', (event) => {
    pressedOutside = event.button === 0 && isOutside(target, event);
  });
  target.addEventListener('click', (event) => {
    const outside = pressedOutside && event.detail > 0 && isOutside(target, event);
    pressedOutside = false;
    if (!outside || target.open !== true) {
      return;
    }
    if (options.isDirty?.()) {
      refuse(options);
      return;
    }
    if (options.dismiss) {
      options.dismiss();
    } else {
      target.open = false;
    }
  });
}

/** Points at Done, the way out that keeps the changes. */
function refuse(options: DismissOptions): void {
  // `focusVisible` shows the focus ring even after a pointer click, in the
  // browsers that support it.
  options.done?.focus({focusVisible: true} as FocusOptions);
}

/**
 * Whether a pointer event landed outside the dialog box.
 *
 * It compares the pointer with the box rather than trusting the event's
 * target: a press on the backdrop that lets go inside the box fires its click
 * on an element both share, and a native dialog's backdrop sends its clicks to
 * the dialog element.
 */
function isOutside(target: Modal, event: MouseEvent): boolean {
  const surface = target.shadowRoot?.querySelector('dialog, [role="dialog"]');
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

/* Questions ------------------------------------------------------------ */

/**
 * A modal that asks one question at a time, such as "Delete this deck?".
 *
 * Each question binds its own answers, and any answer closes the modal before
 * it runs. Closing drops the answers' listeners, so a later answer never
 * reaches an earlier question. The modal's own close button and Escape close
 * it without `close`, so `ask` drops any listeners left over first.
 */
export class ModalQuestion {
  readonly modal: Modal;
  private listeners: AbortController | undefined;

  /** `cancel` is the button that closes the modal without an answer. */
  constructor(target: Modal, cancel: string) {
    this.modal = target;
    target.querySelector(cancel)?.addEventListener('nys-click', () => this.close());
  }

  /** Opens the modal. `answers` maps each answer button's selector to what it does. */
  ask(answers: Record<string, () => void>): void {
    this.listeners?.abort();
    this.listeners = new AbortController();
    const {signal} = this.listeners;
    for (const [selector, answer] of Object.entries(answers)) {
      this.modal.querySelector(selector)?.addEventListener(
        'nys-click',
        () => {
          this.close();
          answer();
        },
        {signal},
      );
    }
    this.modal.open = true;
  }

  /** Closes the modal and forgets the question. On its own, that is Cancel. */
  close(): void {
    this.modal.open = false;
    this.listeners?.abort();
    this.listeners = undefined;
  }
}
