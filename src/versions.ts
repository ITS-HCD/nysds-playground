/**
 * Fetches the design system versions the CDN can serve.
 *
 * Only versions that exist in both packages are offered, because the preview
 * loads the component bundle and the stylesheet at the same version.
 */
import {PLAYGROUND_CONFIG} from './playground.config';
import type {VersionCatalog} from './version-catalog';
import {chooseVersion, isPrerelease} from './version-catalog';

export type {VersionCatalog};
export {chooseVersion, isPrerelease};

/** The subset of the jsDelivr response the playground reads. */
interface JsdelivrPackage {
  tags?: Record<string, string>;
  versions?: string[];
}

let cached: Promise<VersionCatalog> | undefined;

/** Fetches the published versions of one npm package. */
async function fetchVersions(name: string): Promise<JsdelivrPackage> {
  const response = await fetch(`${PLAYGROUND_CONFIG.versionsApi}${name}`);
  if (!response.ok) {
    throw new Error(`The versions API answered ${response.status} for ${name}.`);
  }
  return (await response.json()) as JsdelivrPackage;
}

/** Builds the fallback catalog from the configured list. */
function fallbackCatalog(): VersionCatalog {
  const all = [...PLAYGROUND_CONFIG.fallbackVersions];
  const stable = all.filter((version) => !isPrerelease(version));
  return {
    all,
    stable,
    latest: stable[0] ?? all[0] ?? '',
    usedFallback: true,
  };
}

/**
 * Returns the version catalog, fetching it at most once per page load.
 *
 * When the API is unreachable, the configured fallback list is returned
 * instead so the playground still works offline.
 */
export function loadVersions(): Promise<VersionCatalog> {
  if (!cached) {
    cached = buildCatalog().catch((error: unknown) => {
      console.warn('Could not load the version list from the CDN.', error);
      return fallbackCatalog();
    });
  }
  return cached;
}

async function buildCatalog(): Promise<VersionCatalog> {
  const [components, styles] = await Promise.all([
    fetchVersions(PLAYGROUND_CONFIG.packages.components.name),
    fetchVersions(PLAYGROUND_CONFIG.packages.styles.name),
  ]);
  const stylesVersions = new Set(styles.versions ?? []);
  const all = (components.versions ?? []).filter((version) => stylesVersions.has(version));
  if (all.length === 0) {
    throw new Error('The two packages share no published versions.');
  }
  const stable = all.filter((version) => !isPrerelease(version));
  const taggedLatest = components.tags?.latest;
  const latest =
    taggedLatest && all.includes(taggedLatest) ? taggedLatest : (stable[0] ?? all[0]);
  return {all, stable, latest: latest ?? '', usedFallback: false};
}

/**
 * Turns `latest` into a concrete version number, fetching the catalog first.
 */
export async function resolveVersion(version: string): Promise<string> {
  const catalog = await loadVersions();
  const chosen = chooseVersion(version, catalog);
  if (chosen !== version) {
    if (version && version !== 'latest') {
      console.warn(`The CDN does not list version ${version}. Loading ${chosen} instead.`);
    }
  }
  return chosen || PLAYGROUND_CONFIG.fallbackVersions[0] || 'latest';
}
