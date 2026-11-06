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

type Modal = HTMLElement & {open?: boolean};

let installed = false;

/** Installs the Shift+Tab fix for every `nys-modal` in the page. */
export function repairModalShiftTab(): void {
  if (installed) {
    return;
  }
  installed = true;
  // Capture on the window runs before the modal's own handler.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Tab' || !event.shiftKey || event.defaultPrevented) {
        return;
      }
      // At the window, the target is the topmost element in the document,
      // so focus inside a field in the modal's body reports that field,
      // while focus on the modal's own close button reports the modal.
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.tagName === 'NYS-MODAL') {
        return;
      }
      const modal = target.closest<Modal>('nys-modal');
      if (modal?.open === true) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
