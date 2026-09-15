/**
 * Boots the playground shell: the toolbar, the split pane, and the editors.
 */
import '@nysds/components';
import '@nysds/styles/full';
import './app.css';

import type {PlaygroundProject} from 'playground-elements/playground-project.js';

import type {Deck, Preset} from './decks';
import {DECKS, LIBRARY_DECK_ID, firstPreset, getDeck, getPreset} from './decks';
import {PLAYGROUND_CONFIG, componentsUrl, stylesUrl} from './playground.config';
import {PlaygroundHost} from './playground';
import {Presentation} from './present';
import type {PlaygroundState} from './state';
import {
  debounce,
  deckUrl,
  isPresentMode,
  presentUrl,
  readDeckId,
  readLocation,
  slugify,
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

/** The state used when a deck turns out to be empty. */
const EMPTY_PRESET: Preset = {
  id: 'blank',
  title: 'Blank',
  description: '',
  group: '',
  notes: '',
  html: '<nys-button label="Save"></nys-button>\n',
  css: '',
  js: '',
  version: 'latest',
  editors: null,
};

/** The three editable files of one slide. */
interface SlideEdits {
  html: string;
  css: string;
  js: string;
}

/** Ties the toolbar, the editors, and the URL together. */
class PlaygroundApp {
  private readonly host: PlaygroundHost;
  private readonly deckSelect: HTMLElement;
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
  private readonly deck: Deck;
  private readonly present: boolean;

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

  constructor(
    project: PlaygroundProject,
    deck: Deck,
    initial: PlaygroundState,
    presetId: string | null,
    present: boolean,
    panes: EditorPanes,
  ) {
    this.panes = panes;
    this.deck = deck;
    this.present = present;
    this.version = initial.version;
    this.activePresetId = presetId;
    this.modified = presetId === null;
    this.deckSelect = required('#deck-select');
    this.presetSelect = required('#preset-select');
    this.versionSelect = required('#version-select');
    this.prereleaseToggle = required('#prerelease-toggle');
    this.columnsToggle = required('#columns-toggle');
    this.themeToggle = required('#theme-toggle');
    this.fontSizeSelect = required('#font-size-select');
    this.updateModeSelect = required('#update-mode-select');
    this.settingsModal = required('#settings-modal');
    this.buildButton = required('#build-button');
    this.toast = required('#toast');
    this.host = new PlaygroundHost(project, initial, deck.baseCss);
    this.host.setUpdateMode(this.updateMode);
    this.host.onEdit(() => this.handleEdit());
    this.host.onPendingChange((pending) => this.renderBuildButton(pending));
  }

  /** Renders the toolbar, binds every control, and sets the page title. */
  async start(): Promise<void> {
    this.renderDeckOptions();
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
  getDeck(): Deck {
    return this.deck;
  }

  /** Returns the id of the slide on screen, or `null` for a shared link. */
  getActivePresetId(): string | null {
    return this.activePresetId;
  }

  /** Loads a slide, restoring any edits made to it earlier in the session. */
  loadPreset(preset: Preset): void {
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
  }

  /** Expands the columns a slide asks for and collapses the rest. */
  private applyPresetPanes(presetId: string | null): void {
    const preset = getPreset(this.deck, presetId);
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
    bindClick('#settings-button', () => {
      this.syncSettingsControls();
      this.settingsModal.open = true;
    });
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
    const preset = getPreset(this.deck, this.activePresetId) ?? firstPreset(this.deck);
    if (!preset) {
      return;
    }
    this.edits.delete(preset.id);
    this.loadPreset(preset);
  }

  /** Attaches presentation mode. */
  attachPresentation(presentation: Presentation): void {
    this.presentation = presentation;
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
    }
    this.syncHash();
    this.presentation?.refresh();
  }

  private writeHash(): void {
    // While presenting, the readable `#preset=` link stays put even after an
    // edit, so a refresh returns to the same slide.
    if (this.activePresetId && (this.present || !this.modified)) {
      writePresetHash(this.activePresetId);
      return;
    }
    writeCodeHash(this.currentState());
  }

  private currentState(): PlaygroundState {
    return {...this.host.getState(), version: this.version};
  }

  private updateTitle(): void {
    const preset = this.customCode() ? undefined : getPreset(this.deck, this.activePresetId);
    document.title = preset
      ? `${preset.title} · ${PLAYGROUND_CONFIG.title}`
      : PLAYGROUND_CONFIG.title;
  }

  /** Whether the toolbar should present the session as edited code. */
  private customCode(): boolean {
    return this.modified && !this.present;
  }

  /* Toolbar ------------------------------------------------------------ */

  private renderDeckOptions(): void {
    if (DECKS.length < 2) {
      this.deckSelect.hidden = true;
      return;
    }
    this.deckSelect.hidden = false;
    this.deckSelect.innerHTML = DECKS.map((deck) =>
      option(deck.id, deck.title, deck.id === this.deck.id),
    ).join('');
    this.setSelectValue(this.deckSelect, this.deck.id);
  }

  private renderPresetOptions(): void {
    const parts: string[] = [];
    if (this.customCode()) {
      parts.push(option('__custom__', 'Custom code', true));
    }
    // Group consecutive slides that share a `group` label.
    let openGroup: string | null = null;
    for (const preset of this.deck.presets) {
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
    this.deckSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (!value || value === this.deck.id) {
        return;
      }
      const next = getDeck(value);
      const slide = firstPreset(next);
      window.location.href = deckUrl(next.id, slide?.id ?? '', LIBRARY_DECK_ID);
    });

    this.presetSelect.addEventListener('nys-change', (event) => {
      const value = detailValue(event);
      if (!value || value === '__custom__') {
        return;
      }
      const preset = getPreset(this.deck, value);
      if (preset) {
        this.loadPreset(preset);
        this.presentation?.refresh();
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

    bindClick('#share-button', () => void this.share());
    bindClick('#export-button', () => this.exportPreset());
    bindClick('#reset-button', () => this.resetSlide());
    bindClick('#present-button', () => {
      this.syncHash.flush();
      window.location.href = presentUrl(true);
    });
  }

  private async share(): Promise<void> {
    this.syncHash.cancel();
    // A share link always carries the code, even while presenting, so the
    // person who opens it sees the slide as it looks right now.
    writeCodeHash(this.currentState());
    const url = window.location.href;
    if (this.present && this.activePresetId) {
      writePresetHash(this.activePresetId);
    }
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('success', 'Link copied', 'The share link is on your clipboard.');
    } catch {
      this.showToast(
        'warning',
        'Copy the link yourself',
        'The browser blocked clipboard access. Copy the URL from the address bar.',
      );
    }
  }

  private exportPreset(): void {
    const state = this.currentState();
    const preset = getPreset(this.deck, this.activePresetId);
    const title = preset?.title ?? 'Untitled example';
    const payload = {
      title,
      description: preset?.description ?? '',
      ...(preset?.group ? {group: preset.group} : {}),
      ...(preset?.notes ? {notes: preset.notes} : {}),
      html: state.html,
      css: state.css,
      js: state.js,
      version: state.version,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(title)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast('success', 'Preset exported', 'Move the file into presets/ to keep it.');
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

/** Records a setting in the URL so a copied link opens the same way. */
function replaceQuery(name: string, value: string): void {
  window.history.replaceState(null, '', settingUrl(name, value, window.location.href));
}

/**
 * Makes the divider draggable and remembers the ratio.
 *
 * The panes sit side by side normally and stack while presenting, so the drag
 * follows the pointer's X or Y depending on the mode.
 */
function setupSplitter(present: boolean): void {
  const split = required('#split');
  const divider = required('#divider');
  const storageKey = present ? STORAGE_KEYS.presentEditorSize : STORAGE_KEYS.splitRatio;
  const property = present ? '--pg-present-editor-size' : '--pg-split-ratio';
  if (present) {
    divider.setAttribute('aria-orientation', 'horizontal');
    divider.setAttribute('aria-label', 'Resize the preview and the editors');
  }

  const apply = (ratio: number): void => {
    split.style.setProperty(property, `${ratio.toFixed(2)}%`);
  };

  // While presenting the editors overlay the slide, so the drawer can cover
  // most of it without reflowing the example.
  const min = present ? 15 : 15;
  const max = present ? 85 : 85;
  const fallback = present ? DEFAULTS.presentEditorSize : DEFAULTS.splitRatio;
  apply(readRatio(storageKey, fallback, min, max));

  let dragging = false;
  const move = (clientX: number, clientY: number): void => {
    const rect = split.getBoundingClientRect();
    // While presenting the editors sit below the preview, so a larger pointer
    // Y means a smaller editor pane.
    const span = present ? rect.height : rect.width;
    if (span === 0) {
      return;
    }
    const fraction = present
      ? (rect.bottom - clientY) / span
      : (clientX - rect.left) / span;
    const ratio = Math.min(Math.max(fraction * 100, min), max);
    apply(ratio);
    writeRatio(storageKey, ratio);
  };

  divider.addEventListener('pointerdown', (event) => {
    dragging = true;
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  divider.addEventListener('pointermove', (event) => {
    if (dragging) {
      move(event.clientX, event.clientY);
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
    const back = present ? 'ArrowDown' : 'ArrowLeft';
    const forward = present ? 'ArrowUp' : 'ArrowRight';
    const step = event.key === back ? -2 : event.key === forward ? 2 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const rect = split.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    if (present) {
      move(0, dividerRect.top - (step / 100) * rect.height);
    } else {
      move(dividerRect.left + (step / 100) * rect.width, 0);
    }
  });
}

/** Works out which deck and slide the URL asks for. */
async function resolveInitialState(deck: Deck): Promise<{
  state: PlaygroundState;
  presetId: string | null;
}> {
  const location = readLocation();
  if (location.kind === 'code') {
    return {
      state: {...location.state, version: await resolveVersion(location.state.version)},
      presetId: null,
    };
  }
  const preset =
    (location.kind === 'preset' ? getPreset(deck, location.id) : undefined) ??
    firstPreset(deck) ??
    EMPTY_PRESET;
  return {
    state: {
      version: await resolveVersion(preset.version),
      html: preset.html,
      css: preset.css,
      js: preset.js,
    },
    presetId: preset.id,
  };
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
  setupSplitter(present);

  const deck = getDeck(readDeckId());
  const project = required<PlaygroundProject>('#project');
  const {state, presetId} = await resolveInitialState(deck);
  let app: PlaygroundApp | undefined;
  const panes = new EditorPanes((layout) => {
    // Keep `?editors=` accurate so a copied link opens the same way.
    window.history.replaceState(null, '', layoutUrl(layout, window.location.href));
    app?.syncColumnsToggle();
  });
  app = new PlaygroundApp(project, deck, state, presetId, present, panes);
  await app.start();
  bindBuildShortcut(() => app?.buildNow());

  if (present) {
    const presentation = new Presentation(app, panes);
    app.attachPresentation(presentation);
    presentation.start();
  }

  // Warm the CDN cache check so the first preview paint is not the first
  // request for these URLs.
  void fetch(stylesUrl(state.version), {mode: 'no-cors'}).catch(() => undefined);
  void fetch(componentsUrl(state.version), {mode: 'no-cors'}).catch(() => undefined);
}

void main();
