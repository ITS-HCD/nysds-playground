/**
 * Wires the `playground-elements` project to the playground's own state.
 *
 * The project holds three files. `index.html` is a full document whose head
 * and body tags sit inside `playground-hide` regions, so the HTML tab shows
 * only the markup the user typed. `styles.css` and `script.js` are shown as
 * written.
 */
import 'playground-elements/playground-project.js';
import 'playground-elements/playground-tab-bar.js';
import 'playground-elements/playground-file-editor.js';
import 'playground-elements/playground-preview.js';

import type {PlaygroundProject} from 'playground-elements/playground-project.js';

import {PLAYGROUND_CONFIG, componentsUrl, stylesUrl} from './playground.config';
import type {PlaygroundState} from './state';
import {splitUserHtml, wrapUserHtml} from './wrapper';

const HTML_FILE = 'index.html';
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

  constructor(project: PlaygroundProject, initial: PlaygroundState, baseCss = '') {
    this.project = project;
    this.current = {...initial};
    this.baseCss = baseCss;
    this.project.cdnBaseUrl = PLAYGROUND_CONFIG.cdnBase;
    // `editFile` does not fire `filesChanged`, but every edit schedules a
    // build, so `compileStart` is the signal that something changed. Loading a
    // project also builds, so compare the files before reporting an edit.
    this.project.addEventListener('compileStart', () => this.handleBuild());
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
    this.apply(state);
  }

  /**
   * Switches the design system version, keeping the user's three files.
   *
   * This rebuilds the whole project because the version lives in the hidden
   * head of `index.html`, and the HTML editor holds its own copy of that text.
   * Mutating the file behind the editor would make the next keystroke write
   * the old version back.
   */
  setVersion(version: string): void {
    this.load({...this.readFiles(), version}, this.baseCss);
  }

  /** Returns the current editor contents and version. */
  getState(): PlaygroundState {
    return this.readFiles();
  }

  /** Registers a callback that runs after the user edits any file. */
  onEdit(listener: () => void): void {
    this.listeners.add(listener);
  }

  private apply(state: PlaygroundState): void {
    const html = wrapUserHtml(state.html, {
      stylesHref: stylesUrl(state.version),
      componentsSrc: componentsUrl(state.version),
      extraHeadHtml: PLAYGROUND_CONFIG.extraHeadHtml,
      baseCss: this.baseCss,
      title: PLAYGROUND_CONFIG.title,
    });
    this.project.config = {
      files: {
        [HTML_FILE]: {content: html, label: 'HTML', selected: true},
        [CSS_FILE]: {content: state.css, label: 'CSS'},
        [JS_FILE]: {content: state.js, label: 'JS'},
      },
    };
  }

  private readFiles(): PlaygroundState {
    const files = this.project.files ?? [];
    const find = (name: string): string =>
      files.find((file) => file.name === name)?.content ?? '';
    const wrapped = find(HTML_FILE);
    const html = wrapped ? splitUserHtml(wrapped) : null;
    return {
      version: this.current.version,
      html: html ?? this.current.html,
      css: files.length ? find(CSS_FILE) : this.current.css,
      js: files.length ? find(JS_FILE) : this.current.js,
    };
  }

  private handleBuild(): void {
    const next = this.readFiles();
    if (
      next.html === this.current.html &&
      next.css === this.current.css &&
      next.js === this.current.js
    ) {
      // The build that follows a load is not a user edit.
      return;
    }
    this.current = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
