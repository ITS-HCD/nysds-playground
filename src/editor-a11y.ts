/**
 * Names the code editors and the preview frame, and keeps Tab from getting
 * stuck in the editors.
 *
 * `playground-code-editor` wraps CodeMirror in a frame that takes focus first
 * and shows "Press Enter to start editing, Press Escape to exit editor". The
 * CodeMirror text box inside it is also in the tab order, though, so Tab from
 * the frame lands in the text box, where Tab indents, and Escape returns to
 * the frame, from which Tab lands in the text box again. Taking the text box
 * out of the tab order makes the frame's own instructions true: Tab passes
 * the editor, Enter starts editing, and Escape then Tab moves on.
 *
 * Neither the frame nor the text box has a name of its own, so a screen
 * reader announces an unnamed group and an unnamed text field. The text box
 * gets one through CodeMirror's `contentAttributes`, which
 * `playground-code-editor` accepts through its `extensions` property. The
 * frame has no such hook, so its name is set on the element directly each
 * time focus reaches it, since the editor redraws the frame when it switches
 * between editable and read-only. The tabbed editor's names follow the file
 * it shows, so they change again whenever it switches files.
 *
 * `playground-preview` titles its iframe "Project preview" whatever it shows,
 * and offers no way to change that, so `nameThePreview` sets the title on the
 * frame inside its shadow root.
 */
import {EditorView} from '@codemirror/view';

import {PANE_FILES} from './editors';

/** The `playground-elements` elements this module works on. */
type PlaygroundHost = HTMLElement & {
  extensions?: unknown;
  filename?: string;
  updateComplete?: Promise<unknown>;
  /** Lit's hook for code that runs after every update of the element. */
  addController?: (controller: {hostUpdated?: () => void}) => void;
};

/** How to start and stop editing, read after the frame's name. */
const INSTRUCTIONS = 'Press Enter to edit. Press Escape to stop editing, then Tab to move on.';

/**
 * Names an editor and takes its text box out of the tab order.
 *
 * Pass a fixed `name` for an editor that always shows one file. Leave it out
 * for the tabbed editor, which is named after the file it is showing.
 */
export function makeEditorAccessible(editor: PlaygroundHost, name?: string): void {
  let applied = '';
  const apply = (): void => {
    const file = Object.values(PANE_FILES).find((pane) => pane.file === editor.filename);
    const label = name ?? file?.label ?? 'Code';
    if (label !== applied) {
      applied = label;
      editor.extensions = EditorView.contentAttributes.of({
        'aria-label': `${label} code`,
        tabindex: '-1',
      });
    }
    nameFrame(editor, `${label} editor`);
  };
  editor.addEventListener('focusin', apply);
  whenRendered(editor, apply);
  if (name === undefined) {
    followFile(editor, apply);
  }
}

/**
 * Runs `apply` each time the tabbed editor switches files.
 *
 * The tab bar switches files by setting the editor's `filename`, and the
 * editor picks the first file itself when a project loads. Neither sends an
 * event, so this watches the editor's own updates through Lit's controller
 * hook, then waits for the update to finish before renaming the editor.
 */
function followFile(editor: PlaygroundHost, apply: () => void): void {
  let shown = editor.filename;
  editor.addController?.({
    hostUpdated: () => {
      if (editor.filename !== shown) {
        shown = editor.filename;
        void editor.updateComplete?.then(apply);
      }
    },
  });
}

/** Names the preview frame, which is what a screen reader reads on the way in. */
export function nameThePreview(title: string): void {
  const preview = document.querySelector<PlaygroundHost>('#preview');
  if (!preview) {
    return;
  }
  whenRendered(preview, () => {
    const frame = preview.shadowRoot?.querySelector('iframe');
    if (frame && frame.title !== title) {
      frame.title = title;
    }
  });
}

/**
 * Runs `apply` now, and again once `host` has rendered, since what it changes
 * in the host's shadow root only exists after a render.
 */
function whenRendered(host: PlaygroundHost, apply: () => void): void {
  apply();
  void host.updateComplete?.then(apply);
}

/** Gives the frame around CodeMirror a role, a name, and instructions. */
function nameFrame(editor: HTMLElement, label: string): void {
  const inner = editor.shadowRoot?.querySelector('playground-code-editor') ?? editor;
  const frame = inner.shadowRoot?.querySelector<HTMLElement>('#focusContainer');
  if (!frame || frame.getAttribute('aria-label') === label) {
    return;
  }
  frame.setAttribute('role', 'group');
  frame.setAttribute('aria-label', label);
  frame.setAttribute('aria-description', INSTRUCTIONS);
}
