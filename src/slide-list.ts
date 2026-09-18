/**
 * The slide list inside Deck settings.
 *
 * One row per slide: a drag handle, the position, the title and group as
 * fields, and Move up, Move down, and Remove. Everything stays in the list
 * until Deck settings is applied, so a removal can be undone with Restore, and
 * closing the modal without Done discards the lot.
 *
 * Dragging is for the pointer; the arrows do the same job from the keyboard,
 * and a live region reads out each move.
 */
import type {Slide, SlideEdit} from './deck-model';

type Control = 'up' | 'down' | 'remove' | 'restore';

export class SlideList {
  private rows: SlideEdit[] = [];
  private dragId: string | null = null;

  constructor(
    private readonly list: HTMLElement,
    private readonly status: HTMLElement,
  ) {
    list.addEventListener('dragover', (event) => this.onDragOver(event));
    list.addEventListener('dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node) || !list.contains(event.relatedTarget)) {
        this.clearDropMarks();
      }
    });
    list.addEventListener('drop', (event) => this.onDrop(event));
  }

  /** Fills the list from the deck's slides, discarding any earlier edits. */
  load(slides: readonly Slide[]): void {
    this.rows = slides.map((slide) => ({id: slide.id, title: slide.title, group: slide.group}));
    this.status.textContent = '';
    this.render();
  }

  /** The rows as edited, in their current order. */
  value(): SlideEdit[] {
    return this.rows.map((row) => ({...row}));
  }

  private get kept(): number {
    return this.rows.filter((row) => !row.removed).length;
  }

  private render(focus?: {id: string; control: Control}): void {
    this.list.replaceChildren(...this.rows.map((row, index) => this.row(row, index)));
    if (focus) {
      const selector = `[data-id="${CSS.escape(focus.id)}"] [data-control="${focus.control}"]`;
      const host = this.list.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
        selector,
      );
      // The design system button does not delegate focus to its inner button,
      // and that button only exists once the element has rendered.
      void host?.updateComplete?.then(() => {
        (host.shadowRoot?.querySelector<HTMLElement>('button') ?? host).focus();
      });
    }
  }

  private row(row: SlideEdit, index: number): HTMLElement {
    const item = document.createElement('li');
    item.className = row.removed ? 'slide-row slide-row--removed' : 'slide-row';
    item.dataset.id = row.id;

    const handle = document.createElement('span');
    handle.className = 'slide-row__handle';
    handle.draggable = !row.removed;
    // The arrows are the keyboard route, so the handle is pointer-only.
    handle.setAttribute('aria-hidden', 'true');
    const grip = document.createElement('nys-icon');
    grip.setAttribute('name', 'menu');
    grip.setAttribute('size', 'sm');
    handle.append(grip);
    handle.addEventListener('dragstart', (event) => {
      this.dragId = row.id;
      item.classList.add('slide-row--dragging');
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', row.id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setDragImage(item, 24, 24);
      }
    });
    handle.addEventListener('dragend', () => {
      this.dragId = null;
      item.classList.remove('slide-row--dragging');
      this.clearDropMarks();
    });

    const position = document.createElement('span');
    position.className = 'slide-row__position';
    position.textContent = String(index + 1);

    const title = this.field('slide-row__title', `Slide ${index + 1} title`, row.title, (value) => {
      row.title = value;
    });
    const group = this.field('slide-row__group', `Slide ${index + 1} group`, row.group, (value) => {
      row.group = value;
    });
    group.setAttribute('placeholder', 'Group');
    group.setAttribute('width', 'md');
    if (row.removed) {
      title.setAttribute('disabled', '');
      group.setAttribute('disabled', '');
    }

    const actions = document.createElement('div');
    actions.className = 'slide-row__actions';
    if (row.removed) {
      const restore = document.createElement('nys-button');
      restore.dataset.control = 'restore';
      restore.setAttribute('size', 'sm');
      restore.setAttribute('variant', 'ghost');
      restore.setAttribute('label', 'Restore');
      restore.addEventListener('nys-click', () => this.restore(row));
      actions.append(restore);
    } else {
      actions.append(
        this.circle('up', 'arrow_upward', 'Move up', index === 0, () => this.move(row, -1)),
        this.circle('down', 'arrow_downward', 'Move down', index === this.rows.length - 1, () =>
          this.move(row, 1),
        ),
        this.circle('remove', 'delete', 'Remove', this.kept === 1, () => this.remove(row)),
      );
    }

    item.append(handle, position, title, group, actions);
    return item;
  }

  private field(
    className: string,
    label: string,
    value: string,
    onInput: (value: string) => void,
  ): HTMLElement {
    const input = document.createElement('nys-textinput');
    input.className = className;
    input.setAttribute('arialabel', label);
    input.setAttribute('value', value);
    input.addEventListener('nys-input', (event) => {
      onInput((event as CustomEvent<{value: string}>).detail.value);
    });
    return input;
  }

  private circle(
    control: Control,
    icon: string,
    label: string,
    disabled: boolean,
    handler: () => void,
  ): HTMLElement {
    const button = document.createElement('nys-button');
    button.dataset.control = control;
    button.setAttribute('size', 'sm');
    button.setAttribute('variant', 'ghost');
    button.setAttribute('circle', '');
    button.setAttribute('icon', icon);
    button.setAttribute('label', label);
    if (disabled) {
      button.setAttribute('disabled', '');
    }
    button.addEventListener('nys-click', handler);
    return button;
  }

  private move(row: SlideEdit, delta: number): void {
    const from = this.rows.indexOf(row);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= this.rows.length) {
      return;
    }
    this.rows.splice(from, 1);
    this.rows.splice(to, 0, row);
    // Focus stays on the arrow that was used, unless the row has reached an
    // end and that arrow is now disabled.
    const control: Control =
      delta < 0 ? (to === 0 ? 'down' : 'up') : to === this.rows.length - 1 ? 'up' : 'down';
    this.render({id: row.id, control});
    this.announce(`Moved "${this.name(row)}" to position ${to + 1} of ${this.rows.length}.`);
  }

  private remove(row: SlideEdit): void {
    if (this.kept === 1) {
      return;
    }
    row.removed = true;
    this.render({id: row.id, control: 'restore'});
    this.announce(`"${this.name(row)}" goes when you select Done. Select Restore to keep it.`);
  }

  private restore(row: SlideEdit): void {
    row.removed = false;
    this.render({id: row.id, control: 'remove'});
    this.announce(`Restored "${this.name(row)}".`);
  }

  private name(row: SlideEdit): string {
    return row.title.trim() || 'Untitled slide';
  }

  /** Reads a message to screen readers, even when it repeats the last one. */
  private announce(text: string): void {
    this.status.textContent = '';
    window.requestAnimationFrame(() => {
      this.status.textContent = text;
    });
  }

  private onDragOver(event: DragEvent): void {
    if (!this.dragId) {
      return;
    }
    const target = this.rowAt(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.clearDropMarks();
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    target.classList.add(before ? 'slide-row--drop-before' : 'slide-row--drop-after');
  }

  private onDrop(event: DragEvent): void {
    if (!this.dragId) {
      return;
    }
    const target = this.rowAt(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    const before = target.classList.contains('slide-row--drop-before');
    const from = this.rows.findIndex((row) => row.id === this.dragId);
    const targetIndex = this.rows.findIndex((row) => row.id === target.dataset.id);
    this.clearDropMarks();
    if (from === -1 || targetIndex === -1 || from === targetIndex) {
      return;
    }
    const [row] = this.rows.splice(from, 1);
    let to = before ? targetIndex : targetIndex + 1;
    if (from < to) {
      to -= 1;
    }
    this.rows.splice(to, 0, row!);
    this.render();
    this.announce(`Moved "${this.name(row!)}" to position ${to + 1} of ${this.rows.length}.`);
  }

  /** The row under a drag event, or the last row when the event is on the list itself. */
  private rowAt(event: DragEvent): HTMLElement | null {
    if (event.target === this.list) {
      return this.list.querySelector<HTMLElement>('.slide-row:last-child');
    }
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>('.slide-row') : null;
    return target && this.list.contains(target) ? target : null;
  }

  private clearDropMarks(): void {
    for (const element of this.list.querySelectorAll('.slide-row--drop-before, .slide-row--drop-after')) {
      element.classList.remove('slide-row--drop-before', 'slide-row--drop-after');
    }
  }
}
