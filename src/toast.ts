/**
 * Short confirmations and warnings, shown in a corner and read aloud.
 *
 * `#toast` in `index.html` is a polite live region that is always in the
 * page and never hidden, so inserting an alert into it is the change that
 * gets announced. Warnings use the alert's own assertive region as well.
 */
import type {RememberedFocus} from './focus';
import {rememberFocus} from './focus';

/**
 * How long a toast stays on screen, in milliseconds.
 *
 * Long enough to read two short sentences. The timer pauses while the
 * pointer or focus is on the toast, and the toast can be dismissed sooner.
 */
const TOAST_DURATION_MS = 6000;

/** The kinds of `nys-alert` a toast uses. */
export type ToastType = 'success' | 'warning' | 'info' | 'danger';

class Toaster {
  private readonly host: HTMLElement;
  private timer: number | undefined;
  /** Where focus was when the toast appeared. */
  private opener: RememberedFocus | undefined;

  constructor(host: HTMLElement) {
    this.host = host;
    // A toast waits while someone is reading it with the pointer or has
    // tabbed to its close button.
    host.addEventListener('mouseenter', () => this.clearTimer());
    host.addEventListener('mouseleave', () => this.resumeTimer());
    host.addEventListener('focusin', () => this.clearTimer());
    host.addEventListener('focusout', (event) => {
      if (!host.contains(event.relatedTarget as Node | null)) {
        this.resumeTimer();
      }
    });
  }

  show(type: ToastType, heading: string, text: string): void {
    const alert = document.createElement('nys-alert');
    alert.setAttribute('type', type);
    alert.setAttribute('heading', heading);
    if (text) {
      alert.setAttribute('text', text);
    }
    alert.setAttribute('dismissible', '');
    alert.addEventListener('nys-close', () => this.hide());
    this.opener = rememberFocus();
    this.host.replaceChildren(alert);
    this.resumeTimer();
  }

  /** Removes the toast. Focus goes back where it came from if it was inside. */
  hide(): void {
    this.clearTimer();
    const hadFocus = this.host.contains(document.activeElement);
    this.host.replaceChildren();
    const opener = this.opener;
    this.opener = undefined;
    if (hadFocus) {
      opener?.restore();
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Starts the countdown over, if there is a toast to count down. */
  private resumeTimer(): void {
    this.clearTimer();
    if (this.host.childElementCount > 0) {
      this.timer = window.setTimeout(() => this.hide(), TOAST_DURATION_MS);
    }
  }
}

let toaster: Toaster | undefined;

/** Shows a toast and lets screen readers announce it. */
export function showToast(type: ToastType, heading: string, text = ''): void {
  if (!toaster) {
    const host = document.querySelector<HTMLElement>('#toast');
    if (!host) {
      return;
    }
    toaster = new Toaster(host);
  }
  toaster.show(type, heading, text);
}
