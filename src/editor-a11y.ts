/**
 * Names the code editors and keeps Tab from getting stuck in them.
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
 * between editable and read-only.
 */
import {EditorView} from '@codemirror/view';

/** The editor elements from `playground-elements` this module works on. */
type CodeEditorHost = HTMLElement & {extensions?: unknown; filename?: string};

/** What each project file is called out loud. */
const FILE_NAMES: Record<string, string> = {
  'snippet.html': 'HTML',
  'styles.css': 'CSS',
  'script.js': 'JS',
};

/** How to start and stop editing, read after the frame's name. */
const INSTRUCTIONS = 'Press Enter to edit. Press Escape to stop editing, then Tab to move on.';

/**
 * Names an editor and takes its text box out of the tab order.
 *
 * Pass a fixed `name` for an editor that always shows one file. Leave it out
 * for the tabbed editor, which is named after the file it is showing.
 */
export function makeEditorAccessible(editor: CodeEditorHost, name?: string): void {
  let applied = '';
  const apply = (): void => {
    const label = name ?? FILE_NAMES[editor.filename ?? ''] ?? 'Code';
    if (label !== applied) {
      applied = label;
      editor.extensions = EditorView.contentAttributes.of({
        'aria-label': `${label} code`,
        tabindex: '-1',
      });
    }
    nameFrame(editor, `${label} editor`);
  };
  apply();
  editor.addEventListener('focusin', apply);
  // The frame only exists once the editor has rendered.
  void (editor as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete?.then(apply);
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
