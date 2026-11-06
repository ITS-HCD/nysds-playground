# NYSDS Playground

This app lets you try NYSDS components in the browser, build decks of
slides, and share what you build as a URL. It has no backend: decks live
in IndexedDB in the browser that made them, and NYSDS assets load from
jsDelivr at request time.

## Source map

- `src/playground.config.ts`: the only design-system-specific
  configuration. Package names, dist paths, CDN base, versions API,
  default version, fallback versions, and optional `extraHeadHtml` for
  fonts. Re-pointing this app at another design system starts here.
- `src/deck-model.ts`: the `StoredDeck`/`Slide` shapes and the pure
  helpers around them — id generation, `makeDeck`/`copyOfDeck`,
  `normalizeImport` (accepts a deck file or a single preset), the
  `DeckFile` export shape, `startersToSeed`, which picks the starters a
  browser hasn't received yet, and `missingStarters` for "Restore starter
  decks". No IndexedDB or DOM, so `src/decks.test.ts` covers it directly.
- `src/deck-store.ts`: the only module that touches IndexedDB (through
  `idb-keyval`). List, get, save, delete, duplicate, import, export,
  `seedStarters`, and `restoreStarters`. `seedStarters` adds each starter
  in `STARTER_DECKS` once per browser and records it in IndexedDB, so a
  deleted starter stays deleted and a new one still arrives.
  `restoreStarters` adds back every missing starter.
- `src/starters.ts`: builds `STARTER_DECKS` from `presets/*.json` (one
  starter deck, "Component library") and `decks/*.json` (one starter deck
  each) at build time. This is the only place those directories are read;
  after seeding, the app reads only `src/deck-store.ts`.
- `src/home.ts`: the home page — the deck list and New deck, Import deck,
  Scratch pad, Restore starter decks, and Settings.
- `src/preset-schema.ts`: validates one slide or deck's JSON, shared by
  `src/starters.ts` (build time) and `src/deck-model.ts` (import).
  Reports through `console.error`/`console.warn` rather than throwing.
- `src/theme.ts`: light and dark editor themes (`t` key, `?theme=dark`,
  remembered in localStorage). Dark is the default. Only the editors
  change; the preview always shows the design system as it is.
- `src/editors.ts` and `src/editor-panes.ts`: the tabs and side-by-side
  editor layouts (`e` key, `?editors=columns`; side-by-side is the
  default), and the collapsible HTML, CSS, and JS columns (`1`/`2`/`3`,
  or a slide's `editors` field).
- `src/settings.ts`: owns every remembered setting and its URL query
  parameter — theme, layout, font size, update mode, the on/off flags
  (`readFlag`), and the drawer height. `clearAllSettings` powers "Reset
  settings" in the settings modal.
- `src/present.ts` and `src/keys.ts`: presentation mode, the slide bar,
  and key routing. Editing and presenting share one layout — the drawer
  floats over the preview in both — so `Presentation` mainly toggles the
  toolbar, requests fullscreen, and swaps which slide-bar controls show.
  It also owns where focus goes after a slide bar action and whether the
  code drawer is hidden (`setCodeHidden`). `routeKey` in `src/keys.ts`
  decides what every slide bar key does, as pure logic that
  `src/state.test.ts` covers.
- `src/announce.ts` and `src/toast.ts`: the two ways the app speaks.
  `announce` reads one sentence through a live region, for results with
  no other spoken feedback; only announce what the person asked for.
  `showToast` shows a `nys-alert` in the `#toast` live region, for
  anything a sighted user also needs to see. `visuallyHidden` builds text
  only screen readers read.
- `src/focus.ts`: shared focus helpers. `focusWhenReady` focuses a design
  system element once it has rendered, and `rememberFocus` hands focus
  back after the notes or a toast close.
- `src/editor-a11y.ts`: names the code editors and the preview frame, and
  takes CodeMirror's text box out of the tab order so Tab can't get stuck
  in an editor. It imports `@codemirror/view`, which `vite.config.ts`
  keeps out of Vite's dependency pre-bundling so there is only one copy
  of CodeMirror.
- `src/playground.ts` and `src/debounce.ts`: wire `playground-elements`
  to the playground's state and decide when the preview rebuilds. The
  quiet-period debounce in `src/debounce.ts` backs the Update preview
  setting (`typing`, `pause`, `manual`).
- `src/version-catalog.ts` and `src/versions.ts`: resolve a requested
  version, including `latest` or one the CDN doesn't list, to a version
  the preview can load.
- `src/icon-names.ts` and `src/icons.test.ts`: the icon allowlist and the
  test that enforces it. See Icons, below.
- `src/slide-list.ts`: the slide list inside Deck settings: rename,
  regroup, reorder (drag, or Move up and Move down), and remove slides,
  applied on Done through `arrangeSlides` in `src/deck-model.ts`.
- `src/modals.ts`: everything the playground adds to `nys-modal`:
  closing on an outside click unless the modal holds changes only Done
  applies, the Shift+Tab workaround for `nys-modal` 1.21.0, and
  `ModalQuestion` for the confirm and leave modals.
- `src/main.ts`: boots the app, routes between the home page, a deck, and
  the scratch pad (`routeFor`), and drives the toolbar, autosave, deck
  and slide settings modals, and Share.
- `bin/cli.mjs`: the `nysds-playground` command (`npm start`,
  `npm run present`). Builds the same `#code=`/`#preset=` URLs as
  `src/state.ts` from flags and local files, and is the source of truth
  for every CLI flag. `--deck`/`--preset` only resolve against a deck
  already in the browser that opens the link.
- `presets/*.json` and `decks/*.json`: starter content. Each starter deck
  seeds a browser's deck store once, the first time that browser runs a
  build that has it; the files are not read at runtime after that. See `presets/README.md` for the
  schema.
- `public/fonts/`: the NYSDS app font bundle (Proxima Nova and D Sari)
  with its `nysds-fonts.css`. Licensed for NYS use only, so the `files`
  list in `package.json` keeps it out of the npm package; the links stay
  so installed or hand-copied fonts still load. `index.html` links it
  for the shell, and `extraHeadHtml` in `src/playground.config.ts` links
  it for the preview, which the app resolves to an absolute URL because
  the preview is cross-origin.
- `index.html`: the app shell — home page, toolbar, stage, slide bar, and
  every modal (deck settings, slide settings, share, settings, confirm).
- `vite.config.ts`: build configuration, including `base: './'` so the
  build works under any path.

This app depends on `idb-keyval` for the IndexedDB deck store
(`src/deck-store.ts`). Nothing else in `src/` touches storage directly
except through `src/settings.ts` (`localStorage`).

## Preset and deck schema

Decks live in the browser (`StoredDeck` in `src/deck-model.ts`), but the
starter files in `presets/` and `decks/`, and a deck exported for
Import, all use this slide shape (`Preset` in `src/preset-schema.ts`):

```json
{
  "title": "Button",
  "description": "One sentence shown as the presentation caption.",
  "html": "<nys-button label=\"Save\"></nys-button>",
  "css": "",
  "js": "",
  "group": "",
  "notes": "",
  "version": "1.21.0",
  "editors": null
}
```

`group`, `notes`, `version`, and `editors` are optional. A file in
`presets/` is named `NN-slug.json`; the number sets display order and the
slug becomes the slide's id. A slide inside `decks/*.json`, or inside an
exported deck's `presets` array, uses the same fields but needs its own
`id`, since it isn't loaded from a file of its own.

Use the NYSDS MCP server (`mcp__nysds__*`) for component names,
attributes, and utility classes. Never read `node_modules/@nysds` for
documentation — the MCP server is the authoritative source. NYSDS themes
are applied with a `nys-theme-<id>` class or the `data-theme` attribute in
every published stylesheet through 1.21.1. The MCP themes guide documents
`data-nys-theme`, but no published stylesheet selects on it, so prefer
the class, which both the guide and the shipped CSS support.

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

## Build slides with the design system

Slides demonstrate NYSDS, so build them from NYSDS, in this order:

1. Components (`nys-*`), found with `mcp__nysds__find_components`.
2. Utility classes for layout and spacing: grid, flex, spacing, display,
   type roles, and responsive prefixes, found with
   `mcp__nysds__get_utility_classes`.
3. Tokens (`var(--nys-…)`) in any custom CSS that remains, found with
   `mcp__nysds__find_tokens`.

Don't invent a parallel class system (for example `g-slide`, `g-card`) or
hard-code colors, font sizes, or spacing. Custom CSS is fine when the
slide's point is customization or it shows something NYSDS doesn't ship;
keep it on tokens. NYSDS has no stat component, so use `nys-card` with
the number as its `heading`. `presets/README.md` has a before/after
example.

## Add or edit a preset or deck

There is no per-slide export in the app — only **Export deck**, which
downloads the whole current deck. See `presets/README.md` for the exact
workflow (build it in the app, export the deck, and for a single preset,
pull one slide out of the export). In every case:

1. Build the example in the running app.
2. Check every component attribute against
   `mcp__nysds__validate_component_api` before saving the file, and check
   that the slide follows the guidance in the preceding section.
3. Save the JSON as `presets/NN-slug.json` or `decks/<id>.json`.
4. Run `npm run build`, then open the app in a browser that has not
   seeded yet, or select **Restore starter decks** on the home page, to
   confirm it loads.

## Commands

- `npm start`: run the CLI, which starts the dev server on port 5173 and
  opens a browser tab.
- `npm run present`: the same, with presentation mode on.
- `npm run dev`: start the Vite dev server directly, without the CLI.
- `npm run build`: run `tsc --noEmit`, then build to `dist/`.
- `npm run typecheck`: run `tsc --noEmit` alone.
- `npm run preview`: serve the built `dist/` locally.
- `npm test`: run the `src/*.test.ts` and `bin/*.test.mjs` unit tests
  under `node --test`.

## Verification

A change isn't done until `npm run build` passes. After touching
`src/state.ts`, `src/deck-model.ts`, `src/deck-store.ts`,
`src/starters.ts`, `src/home.ts`, `src/preset-schema.ts`,
`src/present.ts`, `src/keys.ts`, `src/editors.ts`, `src/editor-panes.ts`,
`src/settings.ts`, `bin/cli.mjs`, `vite.config.ts`, or the HTML wrapper
the app injects around user code, check the preview in a browser — URL
routing, deck loading and autosave, editor layout switching, and
presentation key routing are easy to break in ways `tsc` won't catch.

The app targets WCAG 2.2 AA. When you add or change UI, keep it
keyboard-operable with visible focus and no traps, decide where focus
goes when the control that had it disappears, give every icon button a
name that starts with its tooltip text, and announce results that have
no other spoken feedback through `announce` in `src/announce.ts`. A
single-character shortcut goes through `routeKey`, so the Single-key
shortcuts setting can turn it off. `nys-button` reflects its `id`
property only when it renders, so set `id` as an attribute on a button
you create in code if anything looks it up right away, and focus it with
`focusWhenReady` in `src/focus.ts`.

Automated checks (and any browser automation you use to verify a change)
must never trigger `window.confirm`: the app never calls it. Delete
actions go through the `#confirm-modal` `nys-modal` (`confirmAction` in
`src/main.ts`), which a native confirm dialog would block and hang.

## Deployment

A push to `main` runs `.github/workflows/deploy.yml`, which builds the
app and deploys it to GitHub Pages. The `Dockerfile` builds the same app
behind nginx for deployment to Google Cloud Run or any container host.
See `README.md` for both workflows in full. `npm publish` publishes the
package as `@nysds/playground`; `prepublishOnly` runs the tests and the
build first.

## Writing style

Write UI text and documentation in Google developer documentation style:
second person, active voice, present tense, sentence case headings,
short sentences.
