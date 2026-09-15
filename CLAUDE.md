# NYSDS Playground

This app lets you try NYSDS components in the browser and share what you
build as a URL. It has no backend: state lives in the URL, and NYSDS
assets load from jsDelivr at request time.

## Source map

- `src/playground.config.ts`: the only design-system-specific
  configuration. Package names, dist paths, CDN base, versions API,
  default version, fallback versions, and optional `extraHeadHtml` for
  fonts. Re-pointing this app at another design system starts here.
- `src/state.ts`: URL state encoding and decoding — the `#code=` and
  `#preset=` hash formats, and the `?deck=` and `?present=1` query
  parameters.
- `src/decks.ts` and `src/preset-schema.ts`: load and validate
  `presets/*.json` (the implicit Library deck) and `decks/*.json` (named
  decks). Bad JSON reports through `console.error` or `console.warn`
  rather than failing the build.
- `src/theme.ts`: light and dark editor themes (`t` key, `?theme=dark`,
  remembered in localStorage). Only the editors change; the preview
  always shows the design system as it is.
- `src/editors.ts` and `src/editor-panes.ts`: the tabs and side-by-side
  editor layouts (`e` key, `?editors=columns`), and the collapsible HTML,
  CSS, and JS columns (`1`/`2`/`3` in presentation mode, or a preset's
  `editors` field).
- `src/settings.ts`: owns every remembered setting and its URL query
  parameter — theme, layout, font size, update mode, prereleases, and
  every pane size. `clearAllSettings` powers "Reset settings" in the
  settings modal.
- `src/present.ts` and `src/keys.ts`: presentation mode and its key
  routing. The preview stays live and editable during a presentation;
  `src/keys.ts` decides when a key changes slides versus reaching the
  code editor.
- `src/playground.ts` and `src/debounce.ts`: wire `playground-elements`
  to the playground's state and decide when the preview rebuilds. The
  quiet-period debounce in `src/debounce.ts` backs the Update preview
  setting (`typing`, `pause`, `manual`).
- `src/version-catalog.ts` and `src/versions.ts`: resolve a requested
  version, including `latest` or one the CDN doesn't list, to a version
  the preview can load.
- `src/icon-names.ts` and `src/icons.test.ts`: the icon allowlist and the
  test that enforces it. See Icons, below.
- `bin/cli.mjs`: the `nysds-playground` command (`npm start`,
  `npm run present`). Builds the same `#code=`/`#preset=` URLs as
  `src/state.ts` from flags and local files, and is the source of truth
  for every CLI flag.
- `presets/*.json`: bundled example code, loaded through
  `import.meta.glob` at build time. See `presets/README.md` for the
  schema.
- `decks/*.json`: named, ordered slide decks for presentations. Same
  README covers their format.
- `index.html`: the app shell.
- `vite.config.ts`: build configuration, including `base: './'` so the
  build works under any path.

## Preset schema

```json
{
  "title": "Button",
  "description": "One sentence shown as the presentation caption.",
  "html": "<nys-button label=\"Save\"></nys-button>",
  "css": "",
  "js": "",
  "group": "",
  "notes": "",
  "version": "1.21.0"
}
```

`group`, `notes`, and `version` are optional. Files in `presets/` are
named `NN-slug.json`; the number sets display order and the slug becomes
the preset's id. A slide inside a `decks/*.json` file uses the same
fields but needs its own `id`, since it isn't loaded from a file of its
own.

Use the NYSDS MCP server (`mcp__nysds__*`) for component names,
attributes, and utility classes. Never read `node_modules/@nysds` for
documentation — the MCP server is the authoritative source. NYSDS themes
are set with the `data-nys-theme` attribute, not `data-theme`.

`nys-radiogroup` did not reflect a programmatically set selection, so the
settings modal uses `nys-select` for multi-option settings instead.
- Icons: NYSDS ships a curated subset of Material Symbols (82 names). Any
  other name renders as empty space. Check
  https://designsystem.ny.gov/components/icon/ or `src/icon-names.ts`
  before using `icon`, `prefixIcon`, `suffixIcon`, or `<nys-icon name>`.
  `src/icons.test.ts` fails the test run on unknown names in `index.html`,
  `presets/`, and `decks/`. There is no gear icon; use `refresh` for
  reset, `chevron_*` for collapse and navigation, `more_vert` for
  overflow menus, and a text label when nothing fits.

## Add or edit a preset or deck

1. Build the example in the running app.
2. Check every component attribute against
   `mcp__nysds__validate_component_api` before saving the file.
3. Select **Export preset** to download the current editor state in the
   schema.
4. For a standalone preset, rename the file to `NN-slug.json` and move it
   into `presets/`. For a deck slide, add an `id` and append the object
   to that deck's `presets` array in `decks/<id>.json`.
5. Run `npm run build` to confirm it loads.

## Commands

- `npm start`: run the CLI, which starts the dev server on port 5173 and
  opens a browser tab.
- `npm run present`: the same, with presentation mode on.
- `npm run dev`: start the Vite dev server directly, without the CLI.
- `npm run build`: run `tsc --noEmit`, then build to `dist/`.
- `npm run typecheck`: run `tsc --noEmit` alone.
- `npm run preview`: serve the built `dist/` locally.
- `npm test`: run the `src/*.test.ts` unit tests under `node --test`.

## Verification

A change isn't done until `npm run build` passes. After touching
`src/state.ts`, `src/decks.ts`, `src/preset-schema.ts`, `src/present.ts`,
`src/keys.ts`, `src/editors.ts`, `src/editor-panes.ts`, `src/settings.ts`,
`bin/cli.mjs`, `vite.config.ts`, or the HTML wrapper the app injects
around user code, check the preview in a browser — URL state encoding,
deck loading, editor layout switching, and presentation key routing are
easy to break in ways `tsc` won't catch.

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`, which builds the
app and deploys it to GitHub Pages. The `Dockerfile` builds the same app
behind nginx for deployment to Google Cloud Run or any container host.
See `README.md` for both workflows in full.

## Writing style

Write UI text and documentation in Google developer documentation style:
second person, active voice, present tense, sentence case headings,
short sentences.
