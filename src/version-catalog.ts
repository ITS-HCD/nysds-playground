/**
 * Pure helpers for the design system version list.
 *
 * This module imports nothing, so `src/state.test.ts` can load it directly
 * under `node --test`.
 */

/** The versions the CDN can serve for both packages. */
export interface VersionCatalog {
  /** Versions available in both packages, newest first. */
  all: string[];
  /** Stable versions only, newest first. */
  stable: string[];
  /** The newest stable version, used to resolve `latest`. */
  latest: string;
  /** Whether the list came from the fallback because the API was unreachable. */
  usedFallback: boolean;
}

/** Reports whether a version string is a prerelease, such as `2.0.0-next.1`. */
export function isPrerelease(version: string): boolean {
  return version.includes('-');
}

/**
 * Picks the version to load for a requested version string.
 *
 * `latest` and an empty string resolve to the newest stable release. A version
 * the CDN does not list also falls back to the newest stable, which keeps a
 * mistyped or unpublished version in a shared link from breaking the preview.
 * That check is skipped when the catalog came from the built-in fallback list,
 * because that list names only a handful of releases.
 */
export function chooseVersion(requested: string, catalog: VersionCatalog): string {
  if (!requested || requested === 'latest') {
    return catalog.latest || requested;
  }
  if (!catalog.usedFallback && !catalog.all.includes(requested)) {
    return catalog.latest || requested;
  }
  return requested;
}
