/**
 * Boots the playground shell: the toolbar, the split pane, and the editors.
 */
import '@nysds/components';
import '@nysds/styles/full';
import './app.css';

import 'playground-elements/playground-code-editor.js';
import type {PlaygroundProject} from 'playground-elements/playground-project.js';

import type {DeckDraft, Slide, SlideDraft, StoredDeck} from './deck-model';
import {
  BLANK_SLIDE_HTML,
  arrangeSlides,
  countOf,
  describeSlide,
  hasContent,
  getSlide,
  makeSlide,
  nextSlideId,
  slideIndex,
  toDeckFile,
} from './deck-model';
import * as store from './deck-store';
import {announce} from './announce';
import {makeEditorAccessible, nameThePreview} from './editor-a11y';
import type {Modal} from './modals';
import {ModalQuestion, bindModalKeys, guardDismissal, modal} from './modals';
import {showToast} from './toast';
import {HomeView} from './home';
import type {Route} from './routing';
import {needsReboot, routeFor, slideIdFromHash} from './routing';
import {PLAYGROUND_CONFIG, componentsUrl, stylesUrl} from './playground.config';
import {PlaygroundHost} from './playground';
import {Presentation} from './present';
import {SlideList} from './slide-list';
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
import {PANE_FILES, PANE_IDS, collapsedForPreset, layoutUrl} from './editors';
import {isBuildShortcut} from './keys';
import type {DrawerSize, FontSize, UpdateMode} from './settings';
import {
  DEFAULTS,
  DRAWER_LIMITS,
  DRAWER_SIZES,
  DRAWER_SIZE_NAMES,
  STORAGE_KEYS,
  applyFontSize,
  clampRatio,
  clearAllSettings,
  drawerSizeText,
  initialFontSize,
  initialUpdateMode,
  nearestDrawerSize,
  readFlag,
  readRatio,
  settingUrl,
  writeFlag,
  writeKey,
  writeRatio,
} from './settings';
import {applyEditorTheme, initialTheme, setEditorTheme} from './theme';
import {isPrerelease, loadVersions, resolveVersion} from './versions';

/** How long to wait after a keystroke before writing the URL. */
const HASH_DEBOUNCE_MS = 300;

/** The name every new deck starts with, until someone types over it. */
export const UNTITLED_DECK = 'Untitled';

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
  private readonly shortcutsToggle: HTMLElement & {checked?: boolean};
  private readonly drawerSizeSelect: HTMLElement;
  private readonly settingsModal: Modal;
  private readonly leaveQuestion: ModalQuestion;
  private readonly buildButton: HTMLElement;
  private readonly panes: EditorPanes;
  private readonly drawer: Drawer;
  private readonly savedIndicator: HTMLElement;
  private deck: StoredDeck;
  /** True when the deck came from the store rather than the scratch pad. */
  private readonly hasDeck: boolean;
  private present: boolean;
  private savedTimer: number | undefined;

  /** The route the page booted with, used to spot a history move. */
  private readonly bootRoute: Route = routeFor(window.location.search, window.location.hash);

  /** The scratch pad's starting code, so unsaved edits can be spotted. */
  private readonly openedWith: {html: string; css: string; js: string};

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
  private showPrereleases = readFlag('prereleases');
  private fontSize: FontSize = initialFontSize();
  private updateMode: UpdateMode = initialUpdateMode();
  private readonly slideList: SlideList;
  private presentation: Presentation | undefined;
  /** The preview frame's last name, so typing doesn't rename it on every key. */
  private previewTitle = '';
  /** The slide picker's last options, so typing doesn't rebuild it on every key. */
  private presetOptions = '';

  private readonly syncHash = debounce(() => this.writeHash(), HASH_DEBOUNCE_MS);

  private readonly saveSoon = debounce(() => void this.persist(), SAVE_DEBOUNCE_MS);

  constructor(
    project: PlaygroundProject,
    deck: StoredDeck,
    initial: PlaygroundState,
    presetId: string | null,
    present: boolean,
    panes: EditorPanes,
    drawer: Drawer,
  ) {
    this.panes = panes;
    this.drawer = drawer;
    this.deck = deck;
    this.hasDeck = deck.id !== '';
    this.present = present;
    this.version = initial.version;
    this.activePresetId = presetId;
    this.modified = presetId === null;
    this.presetSelect = required('#slide-picker');
    this.versionSelect = required('#version-select');
    this.prereleaseToggle = required('#prerelease-toggle');
    this.columnsToggle = required('#columns-toggle');
    this.themeToggle = required('#theme-toggle');
    this.fontSizeSelect = required('#font-size-select');
    this.updateModeSelect = required('#update-mode-select');
    this.shortcutsToggle = required('#shortcuts-toggle');
    this.drawerSizeSelect = required('#drawer-size-select');
    // The menu takes its percentages from DRAWER_SIZES, so they can't drift.
    this.drawerSizeSelect.innerHTML = (Object.entries(DRAWER_SIZES) as [DrawerSize, number][])
      .map(([name, size]) => option(name, `${DRAWER_SIZE_NAMES[name]} (${size}%)`, false))
      .join('');
    this.settingsModal = modal('#settings-modal');
    this.leaveQuestion = new ModalQuestion(modal('#leave-modal'), '#leave-stay');
    this.buildButton = required('#build-button');
    this.savedIndicator = required('#saved-indicator');
    this.slideList = new SlideList(required('#slide-list'), required('#slide-list-status'));
    this.openedWith = {html: initial.html, css: initial.css, js: initial.js};
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
    this.bindDismissal();
    this.renderBuildButton(false);
    this.updateTitle();
    this.applyPresetPanes(this.activePresetId);
    if (this.activePresetId) {
      // Name the slide in the URL so a refresh stays put.
      writePresetHash(this.activePresetId);
    }
    // A deck that was just created arrives with its name waiting to be typed.
    if (this.hasDeck && new URLSearchParams(window.location.search).has('new')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState(null, '', url.toString());
      this.openTitleEditor();
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
    // The t key switches the theme from the slide bar, so read the theme and
    // the shortcuts setting back rather than keeping copies here.
    this.themeToggle.checked = initialTheme() === 'dark';
    this.prereleaseToggle.checked = this.showPrereleases;
    this.shortcutsToggle.checked = readFlag('singleKeys');
    this.setSelectValue(this.fontSizeSelect, this.fontSize);
    this.setSelectValue(this.updateModeSelect, this.updateMode);
    this.setSelectValue(this.drawerSizeSelect, nearestDrawerSize(this.drawer.size));
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
    bindClick('#build-button', () => this.buildNow());

    this.themeToggle.addEventListener('nys-change', () => {
      setEditorTheme(this.themeToggle.checked === true ? 'dark' : 'light');
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

    this.shortcutsToggle.addEventListener('nys-change', () => {
      this.setSingleKeys(this.shortcutsToggle.checked === true);
    });

    this.drawerSizeSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (value && value in DRAWER_SIZES) {
        this.drawer.set(DRAWER_SIZES[value as DrawerSize]);
      }
    });

    bindClick('#reset-settings-button', () => this.resetSettings());

    bindClick('#deck-settings-button', () => this.openDeckSettings());
    required('#deck-title').addEventListener('click', () => this.openTitleEditor());
    bindClick('#deck-modal-done', () => {
      modal('#deck-modal').open = false;
      void this.applyDeckSettings();
    });

    bindClick('#add-slide-button', () => void this.addSlide());
    bindClick('#slide-settings-button', () => this.openSlideSettings());
    bindClick('#duplicate-slide-button', () => void this.duplicateSlide());
    bindClick('#delete-slide-button', () => this.deleteSlide());
    bindClick('#slide-modal-done', () => {
      modal('#slide-modal').open = false;
      void this.applySlideSettings();
    });

    bindClick('#share-deck-link', () => {
      modal('#share-modal').open = false;
      void this.copyDeckLink();
    });
    bindClick('#share-code-link', () => {
      modal('#share-modal').open = false;
      void this.copyStandaloneLink();
    });
    bindClick('#share-modal-done', () => {
      modal('#share-modal').open = false;
    });

    bindClick('#save-as-deck-button', () => void this.saveAsDeck());
    const goHome = (): void => {
      void this.flushSave().then(() => this.leaveFor('./'));
    };
    // The mark is a real link, so it needs its own handler to run the scratch
    // pad's leave check before the browser follows it.
    required('#toolbar-home').addEventListener('click', (event) => {
      event.preventDefault();
      goHome();
    });

    // A reload or a closed tab must not lose the last keystrokes. A deck
    // autosaves, so only the scratch pad has anything to warn about.
    window.addEventListener('beforeunload', (event) => {
      void this.flushSave();
      if (this.hasUnsavedScratch()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    // The router runs once at start-up, so going back or forward between
    // views has to be turned into a reload.
    window.addEventListener('popstate', () => this.handleHistoryMove());
    window.addEventListener('hashchange', () => this.handleHistoryMove());
  }

  /**
   * Lets a click outside a modal close it when that loses nothing.
   *
   * Deck settings and Slide settings hold a draft that only Done applies, so
   * once it differs from how the modal opened, an outside click or Escape
   * leaves the modal open and moves focus to Done. Settings applies each
   * change as it is made and Share edits nothing, so both always close. An
   * outside click answers the confirm modal with Cancel and the leave modal
   * with Stay, never with the action they ask about.
   */
  private bindDismissal(): void {
    guardDismissal(modal('#deck-modal'), {
      draft: () => this.readDeckDraft(),
      done: required('#deck-modal-done'),
    });
    guardDismissal(modal('#slide-modal'), {
      draft: () => this.readSlideDraft(),
      done: required('#slide-modal-done'),
    });
    guardDismissal(this.settingsModal);
    guardDismissal(modal('#share-modal'));
    guardDismissal(confirmQuestion.modal, {dismiss: () => confirmQuestion.close()});
    guardDismissal(this.leaveQuestion.modal, {dismiss: () => this.leaveQuestion.close()});
  }

  private setSingleKeys(on: boolean): void {
    writeFlag('singleKeys', on);
    this.presentation?.setSingleKeys(on);
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

  /**
   * Reapplies the defaults in place, then clears every remembered setting, so
   * the defaults apply without being remembered.
   */
  private resetSettings(): void {
    setEditorTheme(DEFAULTS.theme);
    this.setFontSize(DEFAULTS.fontSize);
    this.setUpdateMode(DEFAULTS.updateMode);
    this.showPrereleases = DEFAULTS.prereleases;
    this.setSingleKeys(DEFAULTS.singleKeys);
    this.drawer.set(DEFAULTS.drawerSize, false);
    this.panes.reset();
    this.presentation?.setCodeHidden(DEFAULTS.codeCollapsed);
    clearAllSettings();
    void this.renderVersionOptions();
    this.syncSettingsControls();
    showToast('success', 'Settings reset', 'The playground is back to its defaults.');
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

  /**
   * Rebuilds the preview now, whatever the update mode is.
   *
   * Someone asked for this, with Update preview or Cmd or Ctrl plus Enter,
   * so a screen reader hears that it happened. Automatic rebuilds while
   * typing stay quiet.
   */
  buildNow(): void {
    this.host.buildNow();
    announce('Preview updated.');
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
    // A new deck's first slide shows the Excelsior button, so there is something
    // to see. A slide added to a deck that is already going starts empty, so
    // there is nothing to clear away first.
    const slide = makeSlide({
      id: nextSlideId(title, this.deck.slides),
      title,
    });
    const at = slideIndex(this.deck, this.activePresetId);
    const slides = [...this.deck.slides];
    slides.splice(at === -1 ? slides.length : at + 1, 0, slide);
    await this.updateDeck({...this.deck, slides});
    this.loadPreset(slide);
    // The slide opens ready to code. A toast points at Slide settings for the
    // title and notes, rather than a modal standing in the way.
    showToast('success', `${title} added`, 'Name it and add notes in Slide settings.');
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
      showToast('warning', 'Keep one slide', 'A deck needs at least one slide.');
      return;
    }
    const remove = async () => {
      this.saveSoon.cancel();
      const index = slideIndex(this.deck, current.id);
      const slides = this.deck.slides.filter((slide) => slide.id !== current.id);
      // Move to the survivor first so nothing redraws against a slide that is
      // no longer in the deck.
      const nextIndex = Math.min(index, slides.length - 1);
      const next = slides[nextIndex];
      this.activePresetId = next?.id ?? null;
      await this.updateDeck({...this.deck, slides});
      if (next) {
        this.loadPreset(next);
      }
      this.presentation?.refresh();
      // Focus stays on Delete slide, so say where that left things.
      announce(
        next
          ? `Deleted "${current.title}". ${describeSlide(nextIndex, slides.length, next.title)}.`
          : `Deleted "${current.title}".`,
      );
    };
    // A blank slide has nothing to lose, so it goes without a question. The
    // editors may hold something not yet saved, so check what is on screen.
    const onScreen = this.host.getState();
    const asEdited = {...current, html: onScreen.html, css: onScreen.css, js: onScreen.js};
    if (hasContent(asEdited)) {
      confirmAction(
        'Delete this slide?',
        `Delete the slide "${current.title}"? This cannot be undone.`,
        remove,
      );
    } else {
      void remove();
    }
  }

  /** Opens the deck settings modal, which also renames the deck. */
  openDeckSettings(): void {
    setFieldValue('#deck-title-input', this.deck.title);
    setFieldValue('#deck-description-input', this.deck.description);
    setFieldValue('#deck-base-css-input', this.deck.baseCss);
    this.slideList.load(this.deck.slides);
    modal('#deck-modal').open = true;
  }

  /** Deck settings as the fields hold it now. */
  private readDeckDraft(): DeckDraft {
    return {
      title: fieldValue('#deck-title-input'),
      description: fieldValue('#deck-description-input'),
      baseCss: fieldValue('#deck-base-css-input'),
      slides: this.slideList.value(),
    };
  }

  private async applyDeckSettings(): Promise<void> {
    if (!this.hasDeck) {
      return;
    }
    // Write the editors out first, so a slide the list removed cannot take
    // the current editor contents with it.
    await this.flushSave();
    const draft = this.readDeckDraft();
    const title = draft.title.trim() || this.deck.title;
    const slides = arrangeSlides(this.deck.slides, draft.slides);
    const activeSurvives = slides.some((slide) => slide.id === this.activePresetId);
    if (!activeSurvives) {
      this.saveSoon.cancel();
      this.activePresetId = slides[0]?.id ?? null;
    }
    await this.updateDeck({
      ...this.deck,
      title,
      description: draft.description,
      baseCss: draft.baseCss,
      slides,
    });
    if (!activeSurvives && slides[0]) {
      this.loadPreset(slides[0]);
    }
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
    for (const pane of PANE_IDS) {
      const box = required<HTMLElement & {checked?: boolean}>(`#slide-editor-${pane}`);
      box.checked = slide.editors?.includes(pane) ?? false;
    }
    modal('#slide-modal').open = true;
  }

  /** Slide settings as the fields hold it now. */
  private readSlideDraft(): SlideDraft {
    return {
      title: fieldValue('#slide-title-input'),
      group: fieldValue('#slide-group-input'),
      description: fieldValue('#slide-description-input'),
      notes: fieldValue('#slide-notes-input'),
      version: fieldValue('#slide-version-select').trim() || 'latest',
      editors: PANE_IDS.filter(
        (pane) =>
          required<HTMLElement & {checked?: boolean}>(`#slide-editor-${pane}`).checked === true,
      ),
    };
  }

  /**
   * Fills the slide inspector's version menu from the same catalog the toolbar
   * uses, honouring the prerelease setting.
   *
   * The slide's own version shows at once, so the menu reads true before the
   * catalog arrives. A version the catalog no longer lists stays in the menu,
   * so opening the inspector cannot quietly change what a slide pinned.
   */
  private async renderSlideVersionOptions(current: string): Promise<void> {
    const select = required('#slide-version-select');
    const selected = current || 'latest';
    select.innerHTML = option(selected, versionLabel(selected), true);
    this.setSelectValue(select, selected);
    const catalog = await loadVersions();
    const list = this.showPrereleases ? catalog.all : catalog.stable;
    const versions = ['latest', ...list];
    if (!versions.includes(selected)) {
      versions.splice(1, 0, selected);
    }
    select.innerHTML = versions
      .map((version) => option(version, versionLabel(version), version === selected))
      .join('');
    this.setSelectValue(select, selected);
  }

  private async applySlideSettings(): Promise<void> {
    const index = slideIndex(this.deck, this.activePresetId);
    const slide = this.deck.slides[index];
    if (!slide) {
      return;
    }
    const draft = this.readSlideDraft();
    const slides = [...this.deck.slides];
    slides[index] = {
      ...slide,
      title: draft.title.trim() || slide.title,
      group: draft.group,
      description: draft.description,
      notes: draft.notes,
      version: draft.version,
      editors: draft.editors.length > 0 ? draft.editors : null,
    };
    await this.updateDeck({...this.deck, slides});
  }

  /** Downloads the deck as a JSON file. */
  private async exportDeck(): Promise<void> {
    await this.flushSave();
    download(`${this.deck.id || 'deck'}.json`, `${JSON.stringify(toDeckFile(this.deck), null, 2)}\n`);
    showToast('success', 'Deck exported', 'Import the file to open it in another browser.');
  }

  /**
   * Turns the scratch pad into a deck of its own.
   *
   * `destination` is where to go afterwards. Without one, the new deck opens.
   */
  private async saveAsDeck(destination?: string): Promise<void> {
    const state = this.currentState();
    const deck = await store.createDeck(UNTITLED_DECK);
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
    window.location.assign(
      destination ?? `${deckUrl(saved.id, slides[0]!.id, '')}`.replace('#', '&new=1#'),
    );
  }

  /* Leaving ------------------------------------------------------------- */

  /** Whether the scratch pad holds code that is not saved anywhere. */
  private hasUnsavedScratch(): boolean {
    if (this.hasDeck) {
      return false;
    }
    const state = this.host.getState();
    return (
      state.html !== this.openedWith.html ||
      state.css !== this.openedWith.css ||
      state.js !== this.openedWith.js
    );
  }

  /** Goes to a URL, asking first when the scratch pad has unsaved edits. */
  private leaveFor(destination: string): void {
    if (!this.hasUnsavedScratch()) {
      window.location.assign(destination);
      return;
    }
    this.askBeforeLeaving(destination);
  }

  /**
   * Handles a history move.
   *
   * Only a change of view needs a reload. A move within one deck is a slide
   * change, which loads in place; `loadPreset` rewrites the hash with
   * `replaceState`, so that cannot loop.
   */
  private handleHistoryMove(): void {
    const next = routeFor(window.location.search, window.location.hash);
    if (!needsReboot(this.bootRoute, next)) {
      const slideId = slideIdFromHash(window.location.hash);
      const slide = slideId ? getSlide(this.deck, slideId) : undefined;
      if (slide && slide.id !== this.activePresetId) {
        this.loadPreset(slide);
      }
      return;
    }
    const destination = window.location.href;
    if (!this.hasUnsavedScratch()) {
      window.location.reload();
      return;
    }
    // Put the scratch pad back in the address bar so the person is still on
    // the page they are being asked about.
    window.history.pushState(null, '', this.scratchUrl());
    this.askBeforeLeaving(destination);
  }

  /** The URL that describes the scratch pad as it stands. */
  private scratchUrl(): string {
    const url = new URL(window.location.href);
    url.searchParams.delete('deck');
    url.hash = `#code=${encodeState(this.currentState())}`;
    return url.toString();
  }

  private askBeforeLeaving(destination: string): void {
    this.leaveQuestion.ask({
      '#leave-discard': () => window.location.assign(destination),
      '#leave-save': () => void this.saveAsDeck(destination),
    });
  }

  /* Share --------------------------------------------------------------- */

  private openShare(): void {
    this.syncHash.cancel();
    if (!this.hasDeck) {
      void this.copyStandaloneLink();
      return;
    }
    modal('#share-modal').open = true;
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
      showToast('success', heading, detail);
    } catch {
      showToast(
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

  /**
   * Names the page and the preview frame after what is on screen.
   *
   * The scratch pad says so, because its one slide is called "Scratch pad"
   * too. The preview frame's name is what a screen reader reads on the way
   * into the slide.
   */
  private updateTitle(): void {
    const preset = this.customCode() ? undefined : getSlide(this.deck, this.activePresetId);
    if (!this.hasDeck) {
      document.title = `Scratch pad · ${PLAYGROUND_CONFIG.title}`;
    } else {
      document.title = preset
        ? `${preset.title} · ${this.deck.title}`
        : `${this.deck.title} · ${PLAYGROUND_CONFIG.title}`;
    }
    const previewTitle = this.hasDeck && preset ? `Preview of ${preset.title}` : 'Preview';
    if (previewTitle !== this.previewTitle) {
      this.previewTitle = previewTitle;
      nameThePreview(previewTitle);
    }
  }

  /** Whether the toolbar should present the session as edited code. */
  private customCode(): boolean {
    return this.modified && !this.present && !this.hasDeck;
  }

  /* Toolbar ------------------------------------------------------------ */

  /**
   * Shows the deck title. The rename button's name is the title itself, so
   * voice control users can say what they see; "Rename deck" is its
   * description.
   */
  private renderDeckChrome(): void {
    required('#deck-title-text').textContent = this.deck.title;
    required('#deck-title-static').textContent = this.deck.title;
  }

  /* Renaming in place ---------------------------------------------------- */

  /**
   * Swaps the title for a text field, the way a document title behaves.
   *
   * Enter or blur saves, Escape puts the old title back. An empty name is
   * ignored rather than accepted, so a deck always has something to call it.
   */
  openTitleEditor(): void {
    if (!this.hasDeck) {
      return;
    }
    // The heading holds the button, so the whole heading steps aside while
    // the field is up, rather than leaving an empty heading behind.
    const heading = required('#deck-heading');
    const button = required('#deck-title');
    const field = required<HTMLInputElement>('#deck-title-field');
    if (!field.hidden) {
      return;
    }
    const original = this.deck.title;
    field.value = original;
    field.hidden = false;
    heading.hidden = true;
    field.focus();
    field.select();

    const controller = new AbortController();
    const {signal} = controller;
    const close = (): void => {
      controller.abort();
      field.hidden = true;
      heading.hidden = false;
    };
    const commit = (): void => {
      const next = field.value.trim();
      close();
      if (next && next !== original) {
        void this.updateDeck({...this.deck, title: next}).then(() =>
          announce(`Deck renamed to ${next}.`),
        );
      }
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
        // Enter keeps the keyboard where it was; a click away has already
        // put focus somewhere else.
        button.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
        button.focus();
      }
    }, {signal});
    field.addEventListener('blur', commit, {signal});
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
    const options = parts.join('');
    if (options === this.presetOptions) {
      return;
    }
    this.presetOptions = options;
    this.presetSelect.innerHTML = options;
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
      .map((version) => option(version, versionLabel(version), version === this.version))
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
    this.presetSelect.addEventListener('change', (event) => {
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
      writeFlag('prereleases', this.showPrereleases);
      void this.renderVersionOptions();
    });

    bindClick('#share-button', () => this.openShare());
    bindClick('#export-button', () => void this.exportDeck());
    bindClick('#present-button', () => {
      this.syncHash.flush();
      this.presentation?.enter();
    });
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

/** Names a version in a version menu. */
function versionLabel(version: string): string {
  if (version === 'latest') {
    return 'latest (follow the newest release)';
  }
  return isPrerelease(version) ? `${version} (prerelease)` : version;
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

/** The confirm modal. `main` sets it up before anything can ask. */
let confirmQuestion: ModalQuestion;

/**
 * Asks before doing something destructive.
 *
 * It uses the design system modal rather than `window.confirm`, which blocks
 * the page and the automated checks along with it. The heading names the
 * dialog for screen readers, so it says what is about to be deleted.
 */
function confirmAction(heading: string, message: string, onConfirm: () => void): void {
  confirmQuestion.modal.setAttribute('heading', heading);
  required('#confirm-message').textContent = message;
  confirmQuestion.ask({'#confirm-ok': onConfirm});
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

/** The code drawer's height, as a percentage of the stage. */
interface Drawer {
  /** The height now. */
  readonly size: number;
  /** Sets the height and, unless `persist` is false, remembers it. */
  set(ratio: number, persist?: boolean): void;
}

/**
 * Makes the drawer divider draggable and remembers its height.
 *
 * The drawer sits over the bottom of the stage, so a larger pointer Y means a
 * shorter drawer. The divider is a focusable separator, so it reports its
 * value to screen readers, and the up and down arrow keys, Home, and End move
 * it. Settings offers a choice of heights without a drag.
 */
function setupDrawer(): Drawer {
  const stage = required('#split');
  const divider = required('#divider');
  const {min: MIN, max: MAX} = DRAWER_LIMITS;
  let size = readRatio(STORAGE_KEYS.drawerSize, DEFAULTS.drawerSize, MIN, MAX);
  /** The whole percentage the divider last reported. */
  let reported = Number.NaN;

  const set = (ratio: number, persist = true): void => {
    size = clampRatio(ratio, MIN, MAX);
    stage.style.setProperty('--pg-drawer-size', `${size.toFixed(2)}%`);
    // A drag moves the drawer by fractions of a percent on every pointer
    // move, so the divider only reports a change of a whole percent.
    if (Math.round(size) !== reported) {
      reported = Math.round(size);
      divider.setAttribute('aria-valuenow', String(reported));
      divider.setAttribute('aria-valuetext', drawerSizeText(size));
    }
    if (persist) {
      writeRatio(STORAGE_KEYS.drawerSize, size);
    }
  };

  divider.setAttribute('aria-valuemin', String(MIN));
  divider.setAttribute('aria-valuemax', String(MAX));
  set(size, false);

  let dragging = false;
  const move = (clientY: number): void => {
    const rect = stage.getBoundingClientRect();
    if (rect.height === 0) {
      return;
    }
    // Remember the height once, when the drag ends.
    set(((rect.bottom - clientY) / rect.height) * 100, false);
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
    writeRatio(STORAGE_KEYS.drawerSize, size);
    try {
      divider.releasePointerCapture(event.pointerId);
    } catch {
      // The capture may already be gone.
    }
  };
  divider.addEventListener('pointerup', stop);
  divider.addEventListener('pointercancel', stop);
  divider.addEventListener('keydown', (event) => {
    // As in the APG window splitter: the arrows move the divider, and Home
    // and End give the drawer its smallest and largest height.
    const steps: Record<string, number> = {
      ArrowUp: size + 2,
      ArrowDown: size - 2,
      Home: MIN,
      End: MAX,
    };
    const next = steps[event.key];
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    set(next);
  });

  return {
    get size() {
      return size;
    },
    set,
  };
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

/** Shows the "that deck is not here" message. */
function showMissingDeck(): void {
  document.querySelector('#app')?.classList.add('app--missing');
  document.title = `Deck not found · ${PLAYGROUND_CONFIG.title}`;
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
      showToast('success', added === 1 ? 'Deck imported' : `${countOf(added, 'deck')} imported`);
    } else {
      showToast('warning', 'Nothing imported', failure || 'That file is not a deck.');
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
      const copy = await store.duplicateDeck(id);
      await refresh();
      if (copy) {
        showToast('success', 'Deck duplicated', `"${copy.title}" is in the list.`);
      }
    },
    exportDeck: async (id) => {
      const json = await store.exportDeck(id);
      if (json) {
        download(`${id}.json`, json);
      }
    },
    remove: (deck, index) => {
      confirmAction(
        'Delete this deck?',
        `Delete the deck "${deck.title}"? This cannot be undone.`,
        async () => {
          await store.deleteDeck(deck.id);
          await refresh();
          // The card and its buttons are gone, so focus moves to the next
          // deck, or to New deck when the list is empty.
          home.focusAfterRemoval(index);
          announce(`Deleted "${deck.title}".`);
        },
      );
    },
    create: () => {
      // No prompt: the deck appears at once and the editor opens with its name
      // selected, so typing replaces "Untitled" straight away.
      void store.createDeck(UNTITLED_DECK).then((deck) => {
        window.location.assign(`./?deck=${encodeURIComponent(deck.id)}&new=1`);
      });
    },
    importFiles: readFiles,
    restoreStarters: async () => {
      const added = await store.restoreStarters();
      await refresh();
      showToast(
        'success',
        added === 0 ? 'Nothing to restore' : `${countOf(added, 'starter deck')} added`,
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

  bindModalKeys();
  confirmQuestion = new ModalQuestion(modal('#confirm-modal'), '#confirm-cancel');

  // Each bundled starter deck seeds once per browser, so a starter someone
  // deleted stays deleted until they select Restore starter decks.
  await store.seedStarters();

  const drawer = setupDrawer();
  const route = routeFor(window.location.search, window.location.hash);
  if (route.kind === 'home') {
    await startHome(() => {
      modal('#settings-modal').open = true;
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
      drawer,
    );
    await app.start();
    // That editor instance names the page after the scratch pad it stands
    // on, so put the home page's title back.
    document.title = PLAYGROUND_CONFIG.title;
    document.querySelector('#app')?.classList.add('app--home');
    return;
  }

  makeEditorAccessible(required('#file-editor'));
  for (const pane of PANE_IDS) {
    makeEditorAccessible(required(`#column-${pane}-editor`), PANE_FILES[pane].label);
  }
  makeEditorAccessible(required('#deck-base-css-input'), 'Base CSS');

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
  app = new PlaygroundApp(project, deck, state, presetId, present, panes, drawer);
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

/**
 * Shows the shell and removes the splash.
 *
 * `index.html` hides the shell until this runs, so the page never paints
 * unstyled text before the components are defined. It runs even when boot
 * fails, so an error surfaces instead of a blank page.
 */
function revealApp(): void {
  document.querySelector('#app')?.classList.add('app--ready');
  const splash = document.querySelector<HTMLElement>('#splash');
  if (splash) {
    splash.hidden = true;
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error);
  })
  .finally(revealApp);
