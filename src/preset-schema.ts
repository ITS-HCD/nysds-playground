/**
 * Types and validation for preset and deck JSON.
 *
 * This module imports nothing, so `src/state.test.ts` can load it directly
 * under `node --test`.
 */

/** One of the three editor columns. */
export type PaneId = 'html' | 'css' | 'js';

/** The editor columns, in the order they appear. */
export const PANE_IDS: readonly PaneId[] = ['html', 'css', 'js'];

/** One playground example. */
export interface Preset {
  /** The id used in `#preset=`. */
  id: string;
  /** The short name shown in the menu, the caption, and the page title. */
  title: string;
  /** One sentence shown in the presentation caption. */
  description: string;
  /** An optional section label, such as `1. Lock it down`. */
  group: string;
  /** Presenter notes. Never rendered in the preview. */
  notes: string;
  /** The HTML the example loads into the HTML tab. */
  html: string;
  /** The CSS the example loads into the CSS tab. */
  css: string;
  /** The JavaScript the example loads into the JS tab. */
  js: string;
  /** The design system version to switch to, or `latest`. */
  version: string;
  /**
   * Which editor columns to expand when this example loads, as any of
   * `"html"`, `"css"`, and `"js"`.
   *
   * It applies only to the side-by-side layout, and every column not listed is
   * collapsed. An empty array collapses all three. `null` means the file left
   * the field out, which leaves the current columns as they are.
   */
  editors: PaneId[] | null;
}

/** An ordered set of examples that presentation mode steps through. */
export interface Deck {
  /** The id used in `?deck=`. Derived from the filename. */
  id: string;
  /** The name shown in the deck menu. */
  title: string;
  /** One sentence describing the deck. */
  description: string;
  /** CSS injected into every slide's hidden head. */
  baseCss: string;
  /** The slides, in order. */
  presets: Preset[];
}

/** Receives a validation message. Defaults to `console.error`. */
export type Report = (message: string) => void;

const defaultReport: Report = (message) => console.error(message);

const defaultWarn: Report = (message) => console.warn(message);

/** Turns `../presets/01-button.json` into `button`. */
export function idFromPresetPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.json$/i, '').replace(/^\d+[-_]/, '');
}

/** Turns `../decks/styling-levels.json` into `styling-levels`. */
export function idFromDeckPath(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.json$/i, '');
}

/** Reads a string field, reporting anything that is present but not a string. */
function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  fallback: string,
  report: Report,
): string {
  const value = record[key];
  if (typeof value === 'string') {
    return value;
  }
  if (value !== undefined) {
    report(`Preset "${path}" has a "${key}" field of type ${typeof value}. Expected a string.`);
  }
  return fallback;
}

/**
 * Reads an optional `editors` array.
 *
 * Returns `null` when the field is absent. Entries that are not pane ids are
 * reported and dropped, so one typo does not cost the whole example.
 */
function readPanes(
  record: Record<string, unknown>,
  path: string,
  report: Report,
): PaneId[] | null {
  const value = record['editors'];
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    report(
      `Preset "${path}" has an "editors" field of type ${typeof value}. ` +
        'Expected an array of "html", "css", or "js".',
    );
    return null;
  }
  const panes: PaneId[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && (PANE_IDS as readonly string[]).includes(entry)) {
      if (!panes.includes(entry as PaneId)) {
        panes.push(entry as PaneId);
      }
    } else {
      report(
        `Preset "${path}" lists ${JSON.stringify(entry)} in "editors". ` +
          'Expected "html", "css", or "js". Ignoring it.',
      );
    }
  }
  return panes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates one preset.
 *
 * `fallbackId` is the id derived from the filename. Library presets always use
 * it; deck slides must carry their own `id`.
 *
 * Returns `null` when the file cannot be used at all.
 */
export function parsePreset(
  path: string,
  raw: unknown,
  fallbackId: string | null,
  report: Report = defaultReport,
): Preset | null {
  if (!isRecord(raw)) {
    report(`Preset "${path}" is not a JSON object. Skipping it.`);
    return null;
  }
  const id = fallbackId ?? readString(raw, 'id', path, '', report);
  if (!id) {
    report(`Preset "${path}" is missing the required string field "id". Skipping it.`);
    return null;
  }
  if (raw['title'] === undefined) {
    report(`Preset "${path}" is missing the required string field "title".`);
  }
  if (raw['html'] === undefined) {
    report(`Preset "${path}" is missing the required string field "html".`);
  }
  return {
    id,
    title: readString(raw, 'title', path, id, report),
    description: readString(raw, 'description', path, '', report),
    group: readString(raw, 'group', path, '', report),
    notes: readString(raw, 'notes', path, '', report),
    html: readString(raw, 'html', path, '', report),
    css: readString(raw, 'css', path, '', report),
    js: readString(raw, 'js', path, '', report),
    version: readString(raw, 'version', path, 'latest', report) || 'latest',
    editors: readPanes(raw, path, report),
  };
}

/**
 * Validates one deck file. Returns `null` when the file is unusable.
 *
 * `report` receives errors; `warn` receives advisories, such as a deck that
 * still carries a `boilerplate.head` key.
 */
export function parseDeck(
  path: string,
  raw: unknown,
  report: Report = defaultReport,
  warn: Report = defaultWarn,
): Deck | null {
  if (!isRecord(raw)) {
    report(`Deck "${path}" is not a JSON object. Skipping it.`);
    return null;
  }
  const id = idFromDeckPath(path);
  const rawPresets = raw['presets'];
  if (!Array.isArray(rawPresets) || rawPresets.length === 0) {
    report(`Deck "${path}" needs a non-empty "presets" array. Skipping it.`);
    return null;
  }
  const boilerplate = isRecord(raw['boilerplate']) ? raw['boilerplate'] : {};
  if (boilerplate['head'] !== undefined) {
    warn(
      `Deck "${path}" sets "boilerplate.head", which the playground ignores. ` +
        'The playground already loads the design system, and the version menu controls it.',
    );
  }
  const presets: Preset[] = [];
  rawPresets.forEach((entry, index) => {
    const preset = parsePreset(`${path}#presets[${index}]`, entry, null, report);
    if (preset) {
      presets.push(preset);
    }
  });
  if (presets.length === 0) {
    report(`Deck "${path}" has no usable presets. Skipping it.`);
    return null;
  }
  return {
    id,
    title: readString(raw, 'title', path, id, report),
    description: readString(raw, 'description', path, '', report),
    baseCss: typeof boilerplate['baseCss'] === 'string' ? boilerplate['baseCss'] : '',
    presets,
  };
}
