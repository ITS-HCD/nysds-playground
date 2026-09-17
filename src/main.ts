/**
 * Boots the playground shell: the toolbar, the split pane, and the editors.
 */
import '@nysds/components';
import '@nysds/styles/full';
import './app.css';

import type {PlaygroundProject} from 'playground-elements/playground-project.js';

import type {Slide, StoredDeck} from './deck-model';
import {
  BLANK_SLIDE_HTML,
  getSlide,
  makeSlide,
  nextSlideId,
  slideIndex,
  toDeckFile,
} from './deck-model';
import * as store from './deck-store';
import {HomeView} from './home';
import {PLAYGROUND_CONFIG, componentsUrl, stylesUrl} from './playground.config';
import {PlaygroundHost} from './playground';
import {Presentation} from './present';
import type {PlaygroundState} from './state';
import {
  debounce,
  deckUrl,
  encodeState,
  isPresentMode,
  readLocation,
  writeCodeHash,
  writePresetHash,
} from './state';
import {EditorPanes} from './editor-panes';
import type {EditorLayout} from './editors';
import {collapsedForPreset, layoutUrl} from './editors';
import {isBuildShortcut} from './keys';
import type {FontSize, UpdateMode} from './settings';
import {
  DEFAULTS,
  STORAGE_KEYS,
  applyFontSize,
  clearAllSettings,
  initialFontSize,
  initialUpdateMode,
  readPrereleases,
  readRatio,
  settingUrl,
  writeKey,
  writePrereleases,
  writeRatio,
} from './settings';
import type {EditorTheme} from './theme';
import {applyEditorTheme, initialTheme, writeTheme} from './theme';
import {isPrerelease, loadVersions, resolveVersion} from './versions';

/** How long to wait after a keystroke before writing the URL. */
const HASH_DEBOUNCE_MS = 300;

/** How long a toast stays on screen, in milliseconds. */
const TOAST_DURATION_MS = 2600;

/** How long to wait after a keystroke before writing to the store. */
const SAVE_DEBOUNCE_MS = 500;

/** The deck the scratch pad pretends to be, so the slide bar still works. */
function scratchDeck(state?: PlaygroundState): StoredDeck {
  const stamp = new Date(0).toISOString();
  return {
    id: '',
    title: 'Scratch pad',
    description: '',
    baseCss: '',
    slides: [
      makeSlide({
        id: 'scratch',
        title: 'Scratch pad',
        html: state?.html ?? BLANK_SLIDE_HTML,
        css: state?.css ?? '',
        js: state?.js ?? '',
        version: state?.version ?? 'latest',
      }),
    ],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** The three editable files of one slide. */
interface SlideEdits {
  html: string;
  css: string;
  js: string;
}

/** Ties the toolbar, the editors, and the URL together. */
class PlaygroundApp {
  private readonly host: PlaygroundHost;
  private readonly presetSelect: HTMLElement;
  private readonly versionSelect: HTMLElement;
  private readonly prereleaseToggle: HTMLElement & {checked?: boolean};
  private readonly columnsToggle: HTMLElement & {checked?: boolean};
  private readonly themeToggle: HTMLElement & {checked?: boolean};
  private readonly fontSizeSelect: HTMLElement;
  private readonly updateModeSelect: HTMLElement;
  private readonly settingsModal: HTMLElement & {open?: boolean};
  private readonly buildButton: HTMLElement;
  private readonly panes: EditorPanes;
  private readonly toast: HTMLElement;
  private readonly savedIndicator: HTMLElement;
  private deck: StoredDeck;
  /** True when the deck came from the store rather than the scratch pad. */
  private readonly hasDeck: boolean;
  private present: boolean;
  private savedTimer: number | undefined;

  /**
   * This session's edits, keyed by slide id.
   *
   * Stepping back to a slide restores what the presenter typed. Nothing is
   * written to storage, so a reload starts from the deck again.
   */
  private readonly edits = new Map<string, SlideEdits>();

  private version: string;
  private activePresetId: string | null;
  private modified: boolean;
  private showPrereleases = readPrereleases();
  private fontSize: FontSize = initialFontSize();
  private updateMode: UpdateMode = initialUpdateMode();
  private theme: EditorTheme = initialTheme();
  private toastTimer: number | undefined;
  private presentation: Presentation | undefined;

  private readonly syncHash = debounce(() => this.writeHash(), HASH_DEBOUNCE_MS);

  private readonly saveSoon = debounce(() => void this.persist(), SAVE_DEBOUNCE_MS);

  constructor(
    project: PlaygroundProject,
    deck: StoredDeck,
    initial: PlaygroundState,
    presetId: string | null,
    present: boolean,
    panes: EditorPanes,
  ) {
    this.panes = panes;
    this.deck = deck;
    this.hasDeck = deck.id !== '';
    this.present = present;
    this.version = initial.version;
    this.activePresetId = presetId;
    this.modified = presetId === null;
    this.presetSelect = required('#preset-select');
    this.versionSelect = required('#version-select');
    this.prereleaseToggle = required('#prerelease-toggle');
    this.columnsToggle = required('#columns-toggle');
    this.themeToggle = required('#theme-toggle');
    this.fontSizeSelect = required('#font-size-select');
    this.updateModeSelect = required('#update-mode-select');
    this.settingsModal = required('#settings-modal');
    this.buildButton = required('#build-button');
    this.savedIndicator = required('#saved-indicator');
    this.toast = required('#toast');
    this.host = new PlaygroundHost(project, initial, deck.baseCss);
    this.host.setUpdateMode(this.updateMode);
    this.host.onEdit(() => this.handleEdit());
    this.host.onPendingChange((pending) => this.renderBuildButton(pending));
  }

  /** Renders the toolbar, binds every control, and sets the page title. */
  async start(): Promise<void> {
    document.querySelector('#app')?.classList.toggle('app--deck', this.hasDeck);
    this.renderDeckChrome();
    this.renderPresetOptions();
    this.syncSettingsControls();
    this.bindToolbar();
    this.bindSettings();
    this.renderBuildButton(false);
    this.updateTitle();
    this.applyPresetPanes(this.activePresetId);
    if (this.activePresetId) {
      // Name the slide in the URL so a refresh stays put.
      writePresetHash(this.activePresetId);
    }
    await this.renderVersionOptions();
  }

  /** The deck being presented. */
  getDeck(): StoredDeck {
    return this.deck;
  }

  /** Returns the id of the slide on screen, or `null` for a shared link. */
  getActivePresetId(): string | null {
    return this.activePresetId;
  }

  /** Loads a slide, restoring any edits made to it earlier in the session. */
  loadPreset(preset: Slide): void {
    this.activePresetId = preset.id;
    const remembered = this.edits.get(preset.id);
    this.modified = remembered !== undefined;
    const version = preset.version === 'latest' ? this.version : preset.version;
    this.version = version;
    this.host.load(
      {
        version,
        html: remembered?.html ?? preset.html,
        css: remembered?.css ?? preset.css,
        js: remembered?.js ?? preset.js,
      },
      this.deck.baseCss,
    );
    this.setSelectValue(this.versionSelect, version);
    this.renderPresetOptions();
    this.applyPresetPanes(preset.id);
    this.syncHash.cancel();
    writePresetHash(preset.id);
    this.updateTitle();
    this.presentation?.refresh();
  }

  /** Expands the columns a slide asks for and collapses the rest. */
  private applyPresetPanes(presetId: string | null): void {
    const preset = getSlide(this.deck, presetId);
    if (preset) {
      this.panes.applyCollapsed(collapsedForPreset(preset.editors));
    }
  }

  /** Keeps the settings controls in step with the state they describe. */
  syncColumnsToggle(): void {
    this.columnsToggle.checked = this.panes.layout === 'columns';
  }

  private syncSettingsControls(): void {
    this.syncColumnsToggle();
    this.themeToggle.checked = this.theme === 'dark';
    this.prereleaseToggle.checked = this.showPrereleases;
    this.setSelectValue(this.fontSizeSelect, this.fontSize);
    this.setSelectValue(this.updateModeSelect, this.updateMode);
  }

  private bindSettings(): void {
    const openSettings = (): void => {
      this.syncSettingsControls();
      this.settingsModal.open = true;
    };
    bindClick('#settings-button', openSettings);
    // The toolbar is hidden while presenting, so the slide bar carries its own
    // way into the settings and back to editing.
    bindClick('#present-settings-button', openSettings);
    bindClick('#exit-present-button', () => this.presentation?.exit());
    bindClick('#settings-done-button', () => {
      this.settingsModal.open = false;
    });
    bindClick('#build-button', () => this.host.buildNow());

    this.themeToggle.addEventListener('nys-change', () => {
      this.setTheme(this.themeToggle.checked === true ? 'dark' : 'light');
    });

    this.fontSizeSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (value === 'small' || value === 'medium' || value === 'large') {
        this.setFontSize(value);
      }
    });

    this.updateModeSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (value === 'typing' || value === 'pause' || value === 'manual') {
        this.setUpdateMode(value);
      }
    });

    bindClick('#reset-settings-button', () => this.resetSettings());

    bindClick('#rename-deck-button', () => this.openDeckSettings());
    bindClick('#deck-modal-done', () => {
      required<HTMLElement & {open?: boolean}>('#deck-modal').open = false;
      void this.applyDeckSettings();
    });

    bindClick('#add-slide-button', () => void this.addSlide());
    bindClick('#slide-settings-button', () => this.openSlideSettings());
    bindClick('#move-slide-back-button', () => void this.moveSlide(-1));
    bindClick('#move-slide-forward-button', () => void this.moveSlide(1));
    bindClick('#duplicate-slide-button', () => void this.duplicateSlide());
    bindClick('#delete-slide-button', () => this.deleteSlide());
    bindClick('#slide-modal-done', () => {
      required<HTMLElement & {open?: boolean}>('#slide-modal').open = false;
      void this.applySlideSettings();
    });

    bindClick('#share-deck-link', () => {
      required<HTMLElement & {open?: boolean}>('#share-modal').open = false;
      void this.copyDeckLink();
    });
    bindClick('#share-code-link', () => {
      required<HTMLElement & {open?: boolean}>('#share-modal').open = false;
      void this.copyStandaloneLink();
    });
    bindClick('#share-modal-done', () => {
      required<HTMLElement & {open?: boolean}>('#share-modal').open = false;
    });

    bindClick('#save-as-deck-button', () => void this.saveAsDeck());
    bindClick('#home-button', () => {
      void this.flushSave().then(() => {
        window.location.href = './';
      });
    });

    // A reload or a closed tab must not lose the last keystrokes.
    window.addEventListener('beforeunload', () => {
      void this.flushSave();
    });
  }

  private setTheme(theme: EditorTheme): void {
    this.theme = theme;
    applyEditorTheme(theme);
    writeTheme(theme);
    replaceQuery('theme', theme);
  }

  private setFontSize(size: FontSize): void {
    this.fontSize = size;
    applyFontSize(size);
    writeKey(STORAGE_KEYS.fontSize, size);
    replaceQuery('font', size);
  }

  private setUpdateMode(mode: UpdateMode): void {
    this.updateMode = mode;
    this.host.setUpdateMode(mode);
    writeKey(STORAGE_KEYS.updateMode, mode);
    replaceQuery('update', mode);
    this.renderBuildButton(this.host.hasPendingChanges);
  }

  /** Clears every remembered setting and reapplies the defaults in place. */
  private resetSettings(): void {
    clearAllSettings();
    this.setTheme(DEFAULTS.theme);
    this.setFontSize(DEFAULTS.fontSize);
    this.setUpdateMode(DEFAULTS.updateMode);
    this.showPrereleases = DEFAULTS.prereleases;
    void this.renderVersionOptions();
    this.panes.reset();
    this.syncSettingsControls();
    this.showToast('success', 'Settings reset', 'The playground is back to its defaults.');
  }

  /** Shows the manual update button, and marks it when a build is waiting. */
  private renderBuildButton(pending: boolean): void {
    this.buildButton.hidden = this.updateMode !== 'manual';
    this.buildButton.classList.toggle('preview__build--pending', pending);
    this.buildButton.setAttribute(
      'label',
      pending ? 'Update preview (changes pending)' : 'Update preview',
    );
  }

  /** Rebuilds the preview now, whatever the update mode is. */
  buildNow(): void {
    this.host.buildNow();
  }

  /** Discards this session's edits to the current slide. */
  resetSlide(): void {
    const preset = getSlide(this.deck, this.activePresetId) ?? this.deck.slides[0];
    if (!preset) {
      return;
    }
    this.edits.delete(preset.id);
    this.loadPreset(preset);
  }

  /** Attaches the slide bar controller. */
  attachPresentation(presentation: Presentation): void {
    this.presentation = presentation;
  }

  /**
   * Records whether the playground is presenting.
   *
   * Edits made while presenting are a demo, not a change to the deck, so
   * leaving presentation mode drops them and puts the saved slide back. Going
   * the other way commits anything still waiting to be written.
   */
  setPresent(present: boolean): void {
    const wasPresenting = this.present;
    if (present && !wasPresenting) {
      void this.flushSave();
    }
    this.present = present;
    if (!present && wasPresenting && this.hasDeck) {
      this.edits.clear();
      const slide = getSlide(this.deck, this.activePresetId);
      if (slide) {
        this.loadPreset(slide);
      }
    }
    this.renderPresetOptions();
    this.updateTitle();
    this.syncHash.cancel();
    this.writeHash();
  }

  /* Deck editing ------------------------------------------------------- */

  /**
   * Writes the current slide back to the store.
   *
   * Presentation mode never reaches this: edits made while presenting stay in
   * the session so a demo cannot damage the deck.
   */
  private async persist(): Promise<void> {
    if (!this.hasDeck || this.present || !this.activePresetId) {
      return;
    }
    const index = slideIndex(this.deck, this.activePresetId);
    if (index === -1) {
      return;
    }
    const state = this.host.getState();
    const slides = [...this.deck.slides];
    slides[index] = {...slides[index]!, html: state.html, css: state.css, js: state.js};
    this.deck = await store.saveDeck({...this.deck, slides});
    this.showSaved();
  }

  /** Writes anything pending right away. */
  async flushSave(): Promise<void> {
    this.saveSoon.cancel();
    await this.persist();
  }

  /**
   * Replaces the deck in the store and redraws everything that shows it.
   *
   * The scratch pad has no deck to update. The home page builds an editor
   * instance to reuse the settings modal, and that instance shares the deck
   * modal's Done button, so without this guard creating a deck also wrote the
   * scratch pad to the store under an empty id.
   */
  private async updateDeck(deck: StoredDeck): Promise<void> {
    if (!this.hasDeck) {
      return;
    }
    this.deck = await store.saveDeck(deck);
    this.renderDeckChrome();
    this.renderPresetOptions();
    this.updateTitle();
    this.presentation?.refresh();
    this.showSaved();
  }

  private showSaved(): void {
    this.savedIndicator.textContent = 'Saved';
    this.savedIndicator.classList.add('toolbar__saved--on');
    if (this.savedTimer !== undefined) {
      window.clearTimeout(this.savedTimer);
    }
    this.savedTimer = window.setTimeout(() => {
      this.savedIndicator.classList.remove('toolbar__saved--on');
    }, 1400);
  }

  /** Adds a slide after the current one and opens its settings. */
  private async addSlide(): Promise<void> {
    await this.flushSave();
    const title = `Slide ${this.deck.slides.length + 1}`;
    const slide = makeSlide({
      id: nextSlideId(title, this.deck.slides),
      title,
      html: BLANK_SLIDE_HTML,
    });
    const at = slideIndex(this.deck, this.activePresetId);
    const slides = [...this.deck.slides];
    slides.splice(at === -1 ? slides.length : at + 1, 0, slide);
    await this.updateDeck({...this.deck, slides});
    this.loadPreset(slide);
    this.openSlideSettings();
  }

  /** Moves the current slide one place earlier or later. */
  private async moveSlide(delta: number): Promise<void> {
    await this.flushSave();
    const from = slideIndex(this.deck, this.activePresetId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= this.deck.slides.length) {
      return;
    }
    const slides = [...this.deck.slides];
    const [slide] = slides.splice(from, 1);
    slides.splice(to, 0, slide!);
    await this.updateDeck({...this.deck, slides});
  }

  /** Copies the current slide in place. */
  private async duplicateSlide(): Promise<void> {
    await this.flushSave();
    const current = getSlide(this.deck, this.activePresetId);
    if (!current) {
      return;
    }
    const title = `${current.title} copy`;
    const copy = makeSlide({...current, id: nextSlideId(title, this.deck.slides), title});
    const slides = [...this.deck.slides];
    slides.splice(slideIndex(this.deck, current.id) + 1, 0, copy);
    await this.updateDeck({...this.deck, slides});
    this.loadPreset(copy);
  }

  /** Removes the current slide. A deck always keeps at least one. */
  private deleteSlide(): void {
    const current = getSlide(this.deck, this.activePresetId);
    if (!current) {
      return;
    }
    if (this.deck.slides.length === 1) {
      this.showToast('warning', 'Keep one slide', 'A deck needs at least one slide.');
      return;
    }
    confirmAction(`Delete the slide "${current.title}"? This cannot be undone.`, async () => {
      this.saveSoon.cancel();
      const index = slideIndex(this.deck, current.id);
      const slides = this.deck.slides.filter((slide) => slide.id !== current.id);
      // Move to the survivor first so nothing redraws against a slide that is
      // no longer in the deck.
      const next = slides[Math.min(index, slides.length - 1)];
      this.activePresetId = next?.id ?? null;
      await this.updateDeck({...this.deck, slides});
      if (next) {
        this.loadPreset(next);
      }
      this.presentation?.refresh();
    });
  }

  /** Opens the deck settings modal, which also renames the deck. */
  openDeckSettings(): void {
    const modal = required<HTMLElement & {open?: boolean}>('#deck-modal');
    setFieldValue('#deck-title-input', this.deck.title);
    setFieldValue('#deck-description-input', this.deck.description);
    setFieldValue('#deck-base-css-input', this.deck.baseCss);
    modal.open = true;
  }

  private async applyDeckSettings(): Promise<void> {
    if (!this.hasDeck) {
      return;
    }
    const title = fieldValue('#deck-title-input').trim() || this.deck.title;
    await this.updateDeck({
      ...this.deck,
      title,
      description: fieldValue('#deck-description-input'),
      baseCss: fieldValue('#deck-base-css-input'),
    });
    // The base CSS lives in the hidden head, so the preview has to be rebuilt.
    this.host.load(this.currentState(), this.deck.baseCss);
  }

  /** Opens the inspector for the current slide. */
  private openSlideSettings(): void {
    const slide = getSlide(this.deck, this.activePresetId);
    if (!slide) {
      return;
    }
    setFieldValue('#slide-title-input', slide.title);
    setFieldValue('#slide-group-input', slide.group);
    setFieldValue('#slide-description-input', slide.description);
    setFieldValue('#slide-notes-input', slide.notes);
    void this.renderSlideVersionOptions(slide.version);
    for (const pane of ['html', 'css', 'js'] as const) {
      const box = required<HTMLElement & {checked?: boolean}>(`#slide-editor-${pane}`);
      box.checked = slide.editors?.includes(pane) ?? false;
    }
    required<HTMLElement & {open?: boolean}>('#slide-modal').open = true;
  }

  /**
   * Fills the slide inspector's version menu from the same catalog the toolbar
   * uses, honouring the prerelease setting.
   *
   * A version the catalog no longer lists is added anyway, so opening the
   * inspector cannot quietly change what a slide pinned.
   */
  private async renderSlideVersionOptions(current: string): Promise<void> {
    const select = required('#slide-version-select');
    const catalog = await loadVersions();
    const list = this.showPrereleases ? catalog.all : catalog.stable;
    const versions = ['latest', ...list];
    if (current && !versions.includes(current)) {
      versions.splice(1, 0, current);
    }
    select.innerHTML = versions
      .map((version) =>
        option(
          version,
          version === 'latest'
            ? 'latest (follow the newest release)'
            : isPrerelease(version)
              ? `${version} (prerelease)`
              : version,
          version === current,
        ),
      )
      .join('');
    this.setSelectValue(select, current || 'latest');
  }

  private async applySlideSettings(): Promise<void> {
    const index = slideIndex(this.deck, this.activePresetId);
    const slide = this.deck.slides[index];
    if (!slide) {
      return;
    }
    const chosen = (['html', 'css', 'js'] as const).filter(
      (pane) =>
        required<HTMLElement & {checked?: boolean}>(`#slide-editor-${pane}`).checked === true,
    );
    const slides = [...this.deck.slides];
    slides[index] = {
      ...slide,
      title: fieldValue('#slide-title-input').trim() || slide.title,
      group: fieldValue('#slide-group-input'),
      description: fieldValue('#slide-description-input'),
      notes: fieldValue('#slide-notes-input'),
      version: fieldValue('#slide-version-select').trim() || 'latest',
      editors: chosen.length > 0 ? [...chosen] : null,
    };
    await this.updateDeck({...this.deck, slides});
  }

  /** Downloads the deck as a JSON file. */
  private async exportDeck(): Promise<void> {
    await this.flushSave();
    download(`${this.deck.id || 'deck'}.json`, `${JSON.stringify(toDeckFile(this.deck), null, 2)}\n`);
    this.showToast('success', 'Deck exported', 'Import the file to open it in another browser.');
  }

  /** Turns the scratch pad into a deck of its own. */
  private async saveAsDeck(): Promise<void> {
    const state = this.currentState();
    const deck = await store.createDeck('Scratch deck');
    const slides = [
      makeSlide({
        ...deck.slides[0]!,
        html: state.html,
        css: state.css,
        js: state.js,
        version: state.version,
      }),
    ];
    const saved = await store.saveDeck({...deck, slides});
    window.location.href = deckUrl(saved.id, slides[0]!.id, '');
  }

  /* Share --------------------------------------------------------------- */

  private openShare(): void {
    this.syncHash.cancel();
    if (!this.hasDeck) {
      void this.copyStandaloneLink();
      return;
    }
    required<HTMLElement & {open?: boolean}>('#share-modal').open = true;
  }

  private async copyDeckLink(): Promise<void> {
    await this.flushSave();
    const url = deckUrl(this.deck.id, this.activePresetId ?? '', '');
    await this.copy(url, 'Deck link copied', 'It opens this slide in this browser.');
  }

  private async copyStandaloneLink(): Promise<void> {
    const state = this.currentState();
    const url = new URL(window.location.href);
    url.searchParams.delete('deck');
    url.searchParams.delete('present');
    url.hash = `#code=${encodeState(state)}`;
    await this.copy(url.toString(), 'Standalone link copied', 'It carries the code, so it opens anywhere.');
  }

  private async copy(text: string, heading: string, detail: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('success', heading, detail);
    } catch {
      this.showToast(
        'warning',
        'Copy the link yourself',
        'The browser blocked clipboard access. Copy the URL from the address bar.',
      );
    }
  }

  private handleEdit(): void {
    this.modified = true;
    const state = this.host.getState();
    if (this.activePresetId) {
      this.edits.set(this.activePresetId, {html: state.html, css: state.css, js: state.js});
    }
    if (!this.present) {
      // Outside presentation mode, an edit takes the session off the preset,
      // so the link has to carry the code rather than a preset id.
      this.renderPresetOptions();
      this.updateTitle();
      this.saveSoon();
    }
    this.syncHash();
    this.presentation?.refresh();
  }

  private writeHash(): void {
    // The scratch pad has nowhere to save, so its URL has to carry the code.
    if (!this.hasDeck) {
      writeCodeHash(this.currentState());
      return;
    }
    // A deck keeps the readable `#preset=` link: edits are saved to the deck,
    // so the slide id still describes what is on screen. The same holds while
    // presenting.
    if (this.activePresetId) {
      writePresetHash(this.activePresetId);
      return;
    }
    writeCodeHash(this.currentState());
  }

  private currentState(): PlaygroundState {
    return {...this.host.getState(), version: this.version};
  }

  private updateTitle(): void {
    const preset = this.customCode() ? undefined : getSlide(this.deck, this.activePresetId);
    document.title = preset
      ? `${preset.title} · ${this.deck.title}`
      : PLAYGROUND_CONFIG.title;
  }

  /** Whether the toolbar should present the session as edited code. */
  private customCode(): boolean {
    return this.modified && !this.present && !this.hasDeck;
  }

  /* Toolbar ------------------------------------------------------------ */

  private renderDeckChrome(): void {
    required('#deck-title').textContent = this.deck.title;
  }

  private renderPresetOptions(): void {
    const parts: string[] = [];
    if (this.customCode()) {
      parts.push(option('__custom__', 'Custom code', true));
    }
    // Group consecutive slides that share a `group` label.
    let openGroup: string | null = null;
    for (const preset of this.deck.slides) {
      const group = preset.group;
      if (group !== openGroup) {
        if (openGroup) {
          parts.push('</optgroup>');
        }
        if (group) {
          parts.push(`<optgroup label="${escapeAttribute(group)}">`);
        }
        openGroup = group || null;
      }
      const selected = !this.customCode() && preset.id === this.activePresetId;
      parts.push(option(preset.id, preset.title, selected));
    }
    if (openGroup) {
      parts.push('</optgroup>');
    }
    this.presetSelect.innerHTML = parts.join('');
    this.setSelectValue(
      this.presetSelect,
      this.customCode() ? '__custom__' : (this.activePresetId ?? ''),
    );
  }

  private async renderVersionOptions(): Promise<void> {
    const catalog = await loadVersions();
    const list = this.showPrereleases ? catalog.all : catalog.stable;
    // Keep a pinned version visible even when it is not in the catalog.
    const versions = list.includes(this.version) ? list : [this.version, ...list];
    this.versionSelect.innerHTML = versions
      .map((version) =>
        option(
          version,
          isPrerelease(version) ? `${version} (prerelease)` : version,
          version === this.version,
        ),
      )
      .join('');
    this.setSelectValue(this.versionSelect, this.version);
    if (catalog.usedFallback) {
      console.warn('Showing the built-in version list because the CDN did not answer.');
    }
  }

  private setSelectValue(select: HTMLElement, value: string): void {
    (select as HTMLElement & {value?: string}).value = value;
  }

  private bindToolbar(): void {
    this.presetSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (!value || value === '__custom__') {
        return;
      }
      const preset = getSlide(this.deck, value);
      if (preset) {
        this.loadPreset(preset);
      }
    });

    this.versionSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (!value || value === this.version) {
        return;
      }
      this.version = value;
      this.host.setVersion(value);
      this.syncHash.cancel();
      this.writeHash();
    });

    this.columnsToggle.addEventListener('nys-change', () => {
      const layout: EditorLayout = this.columnsToggle.checked === true ? 'columns' : 'tabs';
      this.panes.setLayout(layout);
    });

    this.prereleaseToggle.addEventListener('nys-change', () => {
      this.showPrereleases = this.prereleaseToggle.checked === true;
      writePrereleases(this.showPrereleases);
      void this.renderVersionOptions();
    });

    bindClick('#share-button', () => this.openShare());
    bindClick('#export-button', () => void this.exportDeck());
    bindClick('#present-button', () => {
      this.syncHash.flush();
      this.presentation?.enter();
    });
  }

  private showToast(type: string, heading: string, text: string): void {
    const alert = document.createElement('nys-alert');
    alert.setAttribute('type', type);
    alert.setAttribute('heading', heading);
    alert.setAttribute('text', text);
    alert.setAttribute('dismissible', '');
    this.toast.replaceChildren(alert);
    this.toast.hidden = false;
    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
      this.toast.replaceChildren();
    }, TOAST_DURATION_MS);
  }
}

/* Helpers ------------------------------------------------------------- */

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The page is missing the element "${selector}".`);
  }
  return element;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function option(value: string, label: string, selected: boolean): string {
  const escaped = escapeAttribute(label);
  return `<option value="${escapeAttribute(value)}" label="${escaped}"${
    selected ? ' selected' : ''
  }>${escaped}</option>`;
}

function detailValue(event: Event): string | undefined {
  const detail = (event as CustomEvent<{value?: string}>).detail;
  if (detail && typeof detail.value === 'string') {
    return detail.value;
  }
  return (event.target as HTMLElement & {value?: string}).value;
}

function bindClick(selector: string, handler: () => void): void {
  required(selector).addEventListener('nys-click', handler);
}

/** Reads the value of a design system text field. */
function fieldValue(selector: string): string {
  return required<HTMLElement & {value?: string}>(selector).value ?? '';
}

/** Writes the value of a design system text field. */
function setFieldValue(selector: string, value: string): void {
  required<HTMLElement & {value?: string}>(selector).value = value;
}

/**
 * Asks before doing something destructive.
 *
 * It uses the design system modal rather than `window.confirm`, which blocks
 * the page and the automated checks along with it.
 */
/** Drops the listeners from whichever question the modal asked last. */
let confirmListeners: AbortController | undefined;

function confirmAction(message: string, onConfirm: () => void): void {
  const modal = required<HTMLElement & {open?: boolean}>('#confirm-modal');
  required('#confirm-message').textContent = message;
  // Dismissing the modal with its own close button or Escape skips the Cancel
  // handler, so listeners from an earlier question would otherwise pile up and
  // one confirmation would answer all of them.
  confirmListeners?.abort();
  confirmListeners = new AbortController();
  const {signal} = confirmListeners;
  const close = (): void => {
    modal.open = false;
    confirmListeners?.abort();
    confirmListeners = undefined;
  };
  required('#confirm-ok').addEventListener(
    'nys-click',
    () => {
      close();
      onConfirm();
    },
    {signal},
  );
  required('#confirm-cancel').addEventListener('nys-click', close, {signal});
  modal.open = true;
}

/** Hands the browser a file to save. */
function download(filename: string, text: string): void {
  const blob = new Blob([text], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Records a setting in the URL so a copied link opens the same way. */
function replaceQuery(name: string, value: string): void {
  window.history.replaceState(null, '', settingUrl(name, value, window.location.href));
}

/**
 * Makes the drawer divider draggable and remembers its height.
 *
 * The drawer sits over the bottom of the stage, so a larger pointer Y means a
 * shorter drawer.
 */
function setupSplitter(): void {
  const stage = required('#split');
  const divider = required('#divider');
  const MIN = 15;
  const MAX = 85;

  const apply = (ratio: number): void => {
    stage.style.setProperty('--pg-drawer-size', `${ratio.toFixed(2)}%`);
  };

  apply(readRatio(STORAGE_KEYS.drawerSize, DEFAULTS.drawerSize, MIN, MAX));

  let dragging = false;
  const move = (clientY: number): void => {
    const rect = stage.getBoundingClientRect();
    if (rect.height === 0) {
      return;
    }
    const ratio = Math.min(Math.max(((rect.bottom - clientY) / rect.height) * 100, MIN), MAX);
    apply(ratio);
    writeRatio(STORAGE_KEYS.drawerSize, ratio);
  };

  divider.addEventListener('pointerdown', (event) => {
    dragging = true;
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  divider.addEventListener('pointermove', (event) => {
    if (dragging) {
      move(event.clientY);
    }
  });
  const stop = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    try {
      divider.releasePointerCapture(event.pointerId);
    } catch {
      // The capture may already be gone.
    }
  };
  divider.addEventListener('pointerup', stop);
  divider.addEventListener('pointercancel', stop);
  divider.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowDown' ? -2 : event.key === 'ArrowUp' ? 2 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    move(divider.getBoundingClientRect().top - (step / 100) * rect.height);
  });
}

/** Works out which slide the URL asks for inside a deck. */
async function resolveInitialState(deck: StoredDeck): Promise<{
  state: PlaygroundState;
  presetId: string | null;
}> {
  const location = readLocation();
  if (location.kind === 'code') {
    return {
      state: {...location.state, version: await resolveVersion(location.state.version)},
      presetId: deck.id === '' ? deck.slides[0]!.id : null,
    };
  }
  const slide =
    (location.kind === 'preset' ? getSlide(deck, location.id) : undefined) ?? deck.slides[0]!;
  return {
    state: {
      version: await resolveVersion(slide.version),
      html: slide.html,
      css: slide.css,
      js: slide.js,
    },
    presetId: slide.id,
  };
}

/** Which view the URL asks for. */
export type Route =
  | {kind: 'home'}
  | {kind: 'deck'; id: string}
  | {kind: 'scratch'};

/**
 * Decides between the home page and the editor.
 *
 * A deck id opens that deck. A `#code=` or `#preset=` hash without a deck id
 * opens the scratch pad, which is what a shared link and the CLI produce.
 * Anything else lands on the home page.
 */
export function routeFor(search: string, hash: string): Route {
  const deck = new URLSearchParams(search).get('deck');
  if (deck) {
    return {kind: 'deck', id: deck};
  }
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value.startsWith('code=') || value.startsWith('preset=')) {
    return {kind: 'scratch'};
  }
  return {kind: 'home'};
}

/** Shows the "that deck is not here" message. */
function showMissingDeck(): void {
  document.querySelector('#app')?.classList.add('app--missing');
  required('#deck-missing').hidden = false;
  required('#deck-missing-home').addEventListener('nys-click', () => {
    window.location.href = './';
  });
}

/** Builds and shows the home view. */
async function startHome(openSettings: () => void): Promise<void> {
  const refresh = async (): Promise<void> => {
    home.render(await store.listDecks());
  };
  const readFiles = async (files: FileList | File[]): Promise<void> => {
    let added = 0;
    let failure = '';
    for (const file of Array.from(files)) {
      const result = await store.importDeck(
        await file.text(),
        file.name.replace(/\.json$/i, ''),
      );
      if (result.ok) {
        added += 1;
      } else {
        failure = result.message;
      }
    }
    await refresh();
    if (added > 0) {
      toast('success', added === 1 ? 'Deck imported' : `${added} decks imported`, '');
    } else {
      toast('warning', 'Nothing imported', failure || 'That file is not a deck.');
    }
  };

  const home = new HomeView({
    open: (id) => {
      window.location.href = `./?deck=${encodeURIComponent(id)}`;
    },
    present: (id) => {
      window.location.href = `./?deck=${encodeURIComponent(id)}&present=1`;
    },
    duplicate: async (id) => {
      await store.duplicateDeck(id);
      await refresh();
    },
    exportDeck: async (id) => {
      const json = await store.exportDeck(id);
      if (json) {
        download(`${id}.json`, json);
      }
    },
    remove: (deck) => {
      confirmAction(`Delete the deck "${deck.title}"? This cannot be undone.`, async () => {
        await store.deleteDeck(deck.id);
        await refresh();
      });
    },
    create: () => {
      const modal = required<HTMLElement & {open?: boolean}>('#deck-modal');
      setFieldValue('#deck-title-input', '');
      setFieldValue('#deck-description-input', '');
      setFieldValue('#deck-base-css-input', '');
      const done = required('#deck-modal-done');
      const create = (): void => {
        done.removeEventListener('nys-click', create);
        modal.open = false;
        const title = fieldValue('#deck-title-input').trim() || 'Untitled deck';
        void store.createDeck(title).then((deck) => {
          window.location.href = `./?deck=${encodeURIComponent(deck.id)}`;
        });
      };
      done.addEventListener('nys-click', create);
      modal.open = true;
    },
    importFiles: readFiles,
    restoreStarters: async () => {
      const added = await store.seedStarters();
      await refresh();
      toast(
        'success',
        added === 0 ? 'Nothing to restore' : `${added} starter deck${added === 1 ? '' : 's'} added`,
        added === 0 ? 'Every starter deck is already here.' : '',
      );
    },
    scratch: () => {
      // Changing only the hash does not reload, and the router runs once at
      // start-up, so ask for the reload explicitly.
      window.location.hash = '#preset=scratch';
      window.location.reload();
    },
    openSettings,
  });

  home.show(await store.listDecks());
}

/** Shows a toast outside the editor. */
function toast(type: string, heading: string, text: string): void {
  const host = required('#toast');
  const alert = document.createElement('nys-alert');
  alert.setAttribute('type', type);
  alert.setAttribute('heading', heading);
  if (text) {
    alert.setAttribute('text', text);
  }
  alert.setAttribute('dismissible', '');
  host.replaceChildren(alert);
  host.hidden = false;
  window.setTimeout(() => {
    host.hidden = true;
    host.replaceChildren();
  }, 2600);
}

/** Binds the always-on shortcut that rebuilds the preview immediately. */
function bindBuildShortcut(build: () => void): void {
  window.addEventListener(
    'keydown',
    (event) => {
      if (!isBuildShortcut(event)) {
        return;
      }
      // Cmd+S would otherwise open the browser's save dialog.
      event.preventDefault();
      build();
    },
    true,
  );
}

async function main(): Promise<void> {
  const present = isPresentMode();
  applyEditorTheme(initialTheme());
  applyFontSize(initialFontSize());

  // The bundled decks and presets only seed an empty store.
  await store.seedStarters();

  const route = routeFor(window.location.search, window.location.hash);
  if (route.kind === 'home') {
    await startHome(() => {
      required<HTMLElement & {open?: boolean}>('#settings-modal').open = true;
    });
    // The settings modal is shared with the editor, so bind its controls too.
    const project = required<PlaygroundProject>('#project');
    const panes = new EditorPanes();
    const app = new PlaygroundApp(
      project,
      scratchDeck(),
      {version: await resolveVersion('latest'), html: '', css: '', js: ''},
      null,
      false,
      panes,
    );
    await app.start();
    document.querySelector('#app')?.classList.add('app--home');
    return;
  }

  setupSplitter();

  let deck: StoredDeck;
  if (route.kind === 'deck') {
    const found = await store.getDeck(route.id);
    if (!found) {
      showMissingDeck();
      return;
    }
    deck = found;
  } else {
    deck = scratchDeck();
  }

  const project = required<PlaygroundProject>('#project');
  const {state, presetId} = await resolveInitialState(deck);
  if (route.kind === 'scratch') {
    // The scratch pad's single slide carries whatever the link asked for.
    deck = scratchDeck(state);
  }
  let app: PlaygroundApp | undefined;
  const panes = new EditorPanes((layout) => {
    // Keep `?editors=` accurate so a copied link opens the same way.
    window.history.replaceState(null, '', layoutUrl(layout, window.location.href));
    app?.syncColumnsToggle();
  });
  app = new PlaygroundApp(project, deck, state, presetId, present, panes);
  await app.start();
  bindBuildShortcut(() => app?.buildNow());

  // The slide bar is always on screen, so presentation mode is a state the
  // same controller switches into rather than a separate page.
  const presentation = new Presentation(app, panes);
  app.attachPresentation(presentation);
  presentation.start(present);

  // Warm the CDN cache check so the first preview paint is not the first
  // request for these URLs.
  void fetch(stylesUrl(state.version), {mode: 'no-cors'}).catch(() => undefined);
  void fetch(componentsUrl(state.version), {mode: 'no-cors'}).catch(() => undefined);
}

void main();
