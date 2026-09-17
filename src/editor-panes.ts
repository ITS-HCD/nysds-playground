/**
 * Drives the editor pane: the tabs layout, the side-by-side columns, and which
 * columns are collapsed.
 */
import type {EditorLayout, PaneId} from './editors';
import {
  PANE_FILES,
  PANE_IDS,
  initialLayout,
  otherLayout,
  readCollapsedPanes,
  writeCollapsedPanes,
  writeLayout,
} from './editors';
import {DEFAULTS} from './settings';

/** The elements that make up one column. */
interface ColumnElements {
  column: HTMLElement;
  label: HTMLElement;
  collapse: HTMLElement;
  editor: HTMLElement;
}

/** Shows one layout at a time and remembers what the presenter collapsed. */
export class EditorPanes {
  private readonly app: HTMLElement;
  private readonly tabsLayout: HTMLElement;
  private readonly columnsLayout: HTMLElement;
  private readonly tabsEditor: HTMLElement;
  private readonly columns: Record<PaneId, ColumnElements>;
  private readonly onLayoutChange: (layout: EditorLayout) => void;

  private currentLayout: EditorLayout;
  private collapsed: Set<PaneId>;

  constructor(onLayoutChange: (layout: EditorLayout) => void = () => {}) {
    this.onLayoutChange = onLayoutChange;
    this.app = required('#app');
    this.tabsLayout = required('#tabs-layout');
    this.columnsLayout = required('#columns-layout');
    this.tabsEditor = required('#file-editor');
    this.columns = Object.fromEntries(
      PANE_IDS.map((pane) => [
        pane,
        {
          column: required(`#column-${pane}`),
          label: required(`#column-${pane}-label`),
          collapse: required(`#column-${pane}-collapse`),
          editor: required(`#column-${pane}-editor`),
        },
      ]),
    ) as Record<PaneId, ColumnElements>;

    this.currentLayout = initialLayout();
    this.collapsed = readCollapsedPanes();
    this.bind();
    this.render();
  }

  /** The layout on screen. */
  get layout(): EditorLayout {
    return this.currentLayout;
  }

  /** Reports whether a column is collapsed. */
  isCollapsed(pane: PaneId): boolean {
    return this.collapsed.has(pane);
  }

  /** Switches between the tabs layout and the columns layout. */
  setLayout(layout: EditorLayout, persist = true): void {
    if (layout === this.currentLayout) {
      return;
    }
    this.currentLayout = layout;
    if (persist) {
      writeLayout(layout);
    }
    this.render();
    this.onLayoutChange(layout);
  }

  /** Flips to the other layout. */
  toggleLayout(): void {
    this.setLayout(otherLayout(this.currentLayout));
  }

  /** Collapses a column, or brings it back. */
  togglePane(pane: PaneId): void {
    if (this.collapsed.has(pane)) {
      this.collapsed.delete(pane);
    } else {
      this.collapsed.add(pane);
    }
    writeCollapsedPanes(this.collapsed);
    this.render();
  }

  /**
   * Applies a slide's `editors` field.
   *
   * `null` means the slide said nothing about the columns, so whatever is on
   * screen stays.
   */
  applyCollapsed(collapsed: Set<PaneId> | null): void {
    if (collapsed === null) {
      return;
    }
    this.collapsed = new Set(collapsed);
    writeCollapsedPanes(this.collapsed);
    this.render();
  }

  /** Returns to the tabs layout with every column expanded. */
  reset(): void {
    this.collapsed = new Set();
    writeCollapsedPanes(this.collapsed);
    if (this.currentLayout === DEFAULTS.layout) {
      this.render();
      return;
    }
    this.setLayout(DEFAULTS.layout);
  }

  private bind(): void {
    for (const pane of PANE_IDS) {
      const {label, collapse} = this.columns[pane];
      label.addEventListener('click', () => this.togglePane(pane));
      collapse.addEventListener('nys-click', () => this.togglePane(pane));
    }
  }

  private render(): void {
    const columns = this.currentLayout === 'columns';
    this.app.classList.toggle('app--columns', columns);
    this.tabsLayout.hidden = columns;
    this.columnsLayout.hidden = !columns;

    for (const pane of PANE_IDS) {
      const {column, label, collapse} = this.columns[pane];
      const isCollapsed = this.collapsed.has(pane);
      const {label: name} = PANE_FILES[pane];
      column.classList.toggle('column--collapsed', isCollapsed);
      label.setAttribute('aria-expanded', String(!isCollapsed));
      label.title = isCollapsed ? `Expand ${name}` : `Collapse ${name}`;
      collapse.setAttribute('label', `Collapse ${name}`);
    }

    this.refreshVisibleEditors();
  }

  /**
   * Makes the editors that just became visible re-read their file, and stops
   * the ones that are off screen from writing anything back.
   *
   * Both layouts stay mounted, so a hidden editor still holds the document it
   * had when it was last seen. `project.editFile` does not fire
   * `filesChanged`, so it never learns about edits made in the other layout,
   * and on its next render it would write that stale text back over them.
   * Marking it read-only keeps its CodeMirror from emitting changes at all.
   */
  private refreshVisibleEditors(): void {
    const columns = this.currentLayout === 'columns';
    const visible = new Set<HTMLElement>(
      columns
        ? PANE_IDS.filter((pane) => !this.collapsed.has(pane)).map(
            (pane) => this.columns[pane].editor,
          )
        : [this.tabsEditor],
    );
    const all = [this.tabsEditor, ...PANE_IDS.map((pane) => this.columns[pane].editor)];
    for (const editor of all) {
      (editor as HTMLElement & {readonly?: boolean}).readonly = !visible.has(editor);
    }
    requestAnimationFrame(() => {
      for (const editor of visible) {
        (editor as HTMLElement & {requestUpdate?: () => void}).requestUpdate?.();
      }
    });
  }
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}
