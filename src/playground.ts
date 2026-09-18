/**
 * Wires the `playground-elements` project to the playground's own state.
 *
 * The project holds four files. Three are the editable ones: `snippet.html`,
 * `styles.css`, and `script.js`. The fourth, `index.html`, is hidden from the
 * editors; the host regenerates it from the snippet so the preview has a whole
 * document to load. Keeping the wrapper out of the snippet is what makes
 * select-all in the HTML pane copy only the user's markup.
 */
import 'playground-elements/playground-project.js';
import 'playground-elements/playground-tab-bar.js';
import 'playground-elements/playground-file-editor.js';
import 'playground-elements/playground-preview.js';

import type {PlaygroundProject} from 'playground-elements/playground-project.js';
import type {SampleFile} from 'playground-elements/shared/worker-api.js';

import {PLAYGROUND_CONFIG, componentsUrl, stylesUrl} from './playground.config';
import type {QuietDebounce} from './debounce';
import {createQuietDebounce} from './debounce';
import type {UpdateMode} from './settings';
import {UPDATE_DELAYS} from './settings';
import type {PlaygroundState} from './state';
import {resolveHeadUrls, wrapUserHtml} from './wrapper';

/** The hidden document the preview loads. */
const INDEX_FILE = 'index.html';

/** The editable files, in the order the tabs and columns show them. */
const HTML_FILE = 'snippet.html';
const CSS_FILE = 'styles.css';
const JS_FILE = 'script.js';

/** Drives one `<playground-project>` element. */
export class PlaygroundHost {
  readonly project: PlaygroundProject;

  /** The state last written into the project, used when a split fails. */
  private current: PlaygroundState;

  /** The deck's base CSS, injected into the hidden head of every slide. */
  private baseCss = '';

  private readonly listeners = new Set<() => void>();
  private readonly pendingListeners = new Set<(pending: boolean) => void>();

  /** Whether the files have changed since the last build. */
  private pending = false;

  /**
   * The file contents a load replaced, keyed by file name.
   *
   * Replacing the project's files makes every editor re-render, and an editor
   * that has not caught up writes its old document straight back through
   * `editFile`. Matching that exact text identifies the echo without a timer,
   * so a real keystroke is never dropped, however fast it arrives.
   */
  private echoes = new Map<string, string>();

  /** Waits for typing to stop before it rebuilds the preview. */
  private readonly build: QuietDebounce = createQuietDebounce(() => {
    this.setPending(false);
    void this.project.save();
  }, UPDATE_DELAYS.typing);

  constructor(project: PlaygroundProject, initial: PlaygroundState, baseCss = '') {
    this.project = project;
    this.current = {...initial};
    this.baseCss = baseCss;
    this.project.cdnBaseUrl = PLAYGROUND_CONFIG.cdnBase;
    this.interceptEdits();
    this.apply(initial);
  }

  /**
   * Replaces every file. The editors reset, including the cursor position.
   *
   * `baseCss` is the deck-wide stylesheet. Pass it on every load so switching
   * decks swaps it too.
   */
  load(state: PlaygroundState, baseCss = ''): void {
    this.current = {...state};
    this.baseCss = baseCss;
    // Loading a project builds it right away, whatever the update mode is.
    this.build.cancel();
    this.setPending(false);
    this.echoes = new Map(
      (this.project.files ?? []).map((file) => [file.name, file.content]),
    );
    this.apply(state);
  }

  /**
   * Switches the design system version, keeping the user's three files.
   *
   * The version only appears in the hidden wrapper, so nothing the editors
   * show has to change. Regenerating that file and rebuilding is enough.
   */
  setVersion(version: string): void {
    this.current = {...this.readFiles(), version};
    this.regenerateIndex();
    this.buildNow();
  }

  /** Returns the current editor contents and version. */
  getState(): PlaygroundState {
    return this.readFiles();
  }

  /** Registers a callback that runs after the user edits any file. */
  onEdit(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Registers a callback for the "changes not in the preview yet" state. */
  onPendingChange(listener: (pending: boolean) => void): void {
    this.pendingListeners.add(listener);
  }

  /** Whether edits are waiting to reach the preview. */
  get hasPendingChanges(): boolean {
    return this.pending;
  }

  /**
   * Sets how soon an edit reaches the preview.
   *
   * `manual` stops automatic rebuilds; {@link buildNow} is then the only way.
   */
  setUpdateMode(mode: UpdateMode): void {
    this.build.setDelay(UPDATE_DELAYS[mode]);
  }

  /** Rebuilds the preview right away and clears the pending state. */
  buildNow(): void {
    this.build.flush();
  }

  /**
   * Replaces the project's own build debounce with a quiet-period one.
   *
   * `playground-file-editor` calls `project.editFile` on every keystroke, and
   * `editFile` schedules a build through `saveDebounced`, which the library
   * tunes for "maximal responsiveness". That reloads the preview iframe on
   * almost every character, which reads as a flicker. Wrapping the two methods
   * keeps the library untouched while the playground decides when to build,
   * and gives a reliable edit signal even when builds are switched off.
   */
  private interceptEdits(): void {
    const project = this.project as PlaygroundProject & {
      editFile(file: SampleFile, content: string): void;
      saveDebounced(): Promise<void>;
    };
    const originalEditFile = project.editFile.bind(project);
    const originalSaveDebounced = project.saveDebounced.bind(project);
    // `editFile` calls `saveDebounced` synchronously, so this flag tells the
    // two calls apart: an edit waits for the quiet period, while a library
    // call (such as a project load) builds right away and is never "pending".
    let editing = false;
    project.editFile = (file: SampleFile, content: string): void => {
      if (this.echoes.get(file.name) === content) {
        // An editor that has not caught up with a load, writing back what the
        // load replaced. Drop it once; anything else is a real edit.
        this.echoes.delete(file.name);
        return;
      }
      this.echoes.clear();
      editing = true;
      try {
        originalEditFile(file, content);
        if (file.name === HTML_FILE) {
          // The preview loads the wrapper, so it has to follow the snippet.
          this.regenerateIndex();
        }
      } finally {
        editing = false;
      }
      this.handleEdit();
    };
    project.saveDebounced = (): Promise<void> => {
      if (!editing) {
        return originalSaveDebounced();
      }
      this.setPending(true);
      this.build.schedule();
      return Promise.resolve();
    };
  }

  private setPending(pending: boolean): void {
    if (this.pending === pending) {
      return;
    }
    this.pending = pending;
    for (const listener of this.pendingListeners) {
      listener(pending);
    }
  }

  /** Builds the hidden preview document from the snippet on screen. */
  private wrap(state: PlaygroundState): string {
    return wrapUserHtml(state.html, {
      stylesHref: stylesUrl(state.version),
      componentsSrc: componentsUrl(state.version),
      extraHeadHtml: resolveHeadUrls(PLAYGROUND_CONFIG.extraHeadHtml, document.baseURI),
      baseCss: this.baseCss,
      title: PLAYGROUND_CONFIG.title,
    });
  }

  /**
   * Rewrites the hidden preview document in place.
   *
   * No editor shows this file, so changing its content behind the library's
   * back is safe, and it avoids resetting the project on every keystroke.
   */
  private regenerateIndex(): void {
    const index = (this.project.files ?? []).find((file) => file.name === INDEX_FILE);
    if (index) {
      index.content = this.wrap(this.readFiles());
    }
  }

  private apply(state: PlaygroundState): void {
    this.project.config = {
      files: {
        [HTML_FILE]: {content: state.html, label: 'HTML', selected: true},
        [CSS_FILE]: {content: state.css, label: 'CSS'},
        [JS_FILE]: {content: state.js, label: 'JS'},
        [INDEX_FILE]: {content: this.wrap(state), hidden: true},
      },
    };
  }

  private readFiles(): PlaygroundState {
    const files = this.project.files ?? [];
    const find = (name: string): string =>
      files.find((file) => file.name === name)?.content ?? '';
    return {
      version: this.current.version,
      html: files.length ? find(HTML_FILE) : this.current.html,
      css: files.length ? find(CSS_FILE) : this.current.css,
      js: files.length ? find(JS_FILE) : this.current.js,
    };
  }

  private handleEdit(): void {
    const next = this.readFiles();
    if (
      next.html === this.current.html &&
      next.css === this.current.css &&
      next.js === this.current.js
    ) {
      return;
    }
    this.current = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
