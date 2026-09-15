/**
 * Single point of configuration for the playground.
 *
 * To point the playground at a different design system or a different CDN,
 * edit this file. Nothing else in `src/` hard-codes a package name or a URL.
 */

/** An npm package the preview loads from the CDN. */
export interface PlaygroundPackage {
  /** The npm package name, for example `@nysds/components`. */
  name: string;
  /** The path inside the package, relative to the package root. */
  path: string;
}

/** The shape of {@link PLAYGROUND_CONFIG}. */
export interface PlaygroundAppConfig {
  /** The application title. It appears in the toolbar and the page title. */
  title: string;
  /** The packages the preview document loads. */
  packages: {
    /** The JavaScript bundle that registers the custom elements. */
    components: PlaygroundPackage;
    /** The stylesheet that provides the reset, typography, and utilities. */
    styles: PlaygroundPackage;
  };
  /** The CDN origin that serves npm packages, with no trailing slash. */
  cdnBase: string;
  /** The versions API endpoint, with a trailing slash. Append a package name. */
  versionsApi: string;
  /** The version to select on first load. Use `latest` for the newest stable. */
  defaultVersion: string;
  /** The versions to offer when the versions API is unreachable. */
  fallbackVersions: string[];
  /** Extra markup to add to the preview `<head>`, such as a fonts stylesheet. */
  extraHeadHtml: string;
  /** Whether the version list includes prereleases before you opt in. */
  showPrereleasesByDefault: boolean;
}

export const PLAYGROUND_CONFIG: PlaygroundAppConfig = {
  title: 'NYSDS Playground',
  packages: {
    components: {name: '@nysds/components', path: 'dist/nysds.js'},
    styles: {name: '@nysds/styles', path: 'dist/nysds-full.min.css'},
  },
  cdnBase: 'https://cdn.jsdelivr.net/npm',
  versionsApi: 'https://data.jsdelivr.com/v1/package/npm/',
  defaultVersion: 'latest',
  fallbackVersions: ['1.21.0', '1.20.1', '1.20.0', '1.19.4'],
  extraHeadHtml: '',
  showPrereleasesByDefault: false,
};

/** Returns the CDN URL for a package file at a given version. */
export function cdnUrl(pkg: PlaygroundPackage, version: string): string {
  return `${PLAYGROUND_CONFIG.cdnBase}/${pkg.name}@${version}/${pkg.path}`;
}

/** Returns the stylesheet URL the preview loads at a given version. */
export function stylesUrl(version: string): string {
  return cdnUrl(PLAYGROUND_CONFIG.packages.styles, version);
}

/** Returns the component bundle URL the preview loads at a given version. */
export function componentsUrl(version: string): string {
  return cdnUrl(PLAYGROUND_CONFIG.packages.components, version);
}
