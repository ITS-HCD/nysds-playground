# NYSDS Playground

NYSDS Playground is a web app for building and presenting examples of New
York State Design System (NYSDS) components in the browser. You edit
HTML, CSS, and JavaScript for each slide of a deck, the app saves your
decks in that browser, and you share what you build as a URL.

Live site: https://its-hcd.github.io/nysds-playground/

Source: https://github.com/ITS-HCD/nysds-playground

## Quick start

Prerequisites: Node.js 20 or newer.

1. Clone the repository and change into it.
2. Run `npm install`.
3. Run `npm start`.

`npm start` runs the CLI, which starts the dev server on port 5173 and
opens a browser tab. See Use the CLI for other ways to run it.

## Home page

The bare URL opens the home page: a card for every deck saved in this
browser, each with **Open**, **Present**, **Duplicate**, **Export**, and
**Delete**. Above the list:

- **New deck** creates a deck named "Untitled" and opens it at once —
  there's no name prompt. The title opens selected for editing, so
  typing replaces "Untitled" right away.
- **Import deck** adds a deck from a JSON file, through a file picker or
  by dragging a file anywhere onto the page. It accepts a deck export or
  a single preset, which becomes a one-slide deck. If the imported id is
  already taken, the copy gets a `-2` suffix.
- **Scratch pad** opens the editor with no deck attached, for trying
  something out before you commit to a deck. See Share, below, for how
  to turn it into one.
- **Restore starter decks** adds back any bundled starter deck that is
  missing from this browser.
- **Settings** opens the same settings modal as the editor.

## Decks live in your browser

Decks are stored in IndexedDB, in the browser you're using, not as files
in this repository. The JSON files in `presets/` and `decks/` are
starter content: the first time the playground runs in a browser, it
copies them into that browser's store as starter decks (the presets
become one deck called **Component library**), and after that the app
reads only from the store. Editing or adding a file in `presets/` or
`decks/` and rebuilding has no effect on a browser that already seeded —
select **Restore starter decks** on the home page to add back anything
that changed or is missing.

Decks do not sync between browsers or machines. Use **Export** on a deck
card, or **Export deck** in the editor toolbar, to download a deck as
JSON, and **Import deck** on the home page to bring it into another
browser.

## Editing a deck

Opening or creating a deck puts you in the editor. The preview fills the
stage, and its own "Result" bar stays hidden — press Cmd+Enter or
Ctrl+Enter, or Cmd+S or Ctrl+S, or use the manual-mode **Update preview**
button, to force a rebuild. The HTML, CSS, and JS editors float in a
drawer over the bottom of the stage — drag the divider to resize it, or
press `c` to collapse it. The slide bar along the bottom shows a slide
picker in place of a title, grouped the way your slides are grouped,
with **Previous** and **Next**, and, while editing, **Add slide**,
**Slide settings**, **Move earlier**, **Move later**, **Duplicate
slide**, and **Delete slide**.

The toolbar is one row: the NYSDS mark (a link to Home), the deck title,
**Deck settings**, and the **Saved** indicator on the left; the version
selector, **Share**, **Export deck**, **Settings**, and **Present** on
the right. Share, Export deck, and Settings are icon buttons with
tooltips.

Click the deck title to rename it in place, the way a document title
behaves: type the new name, then press Enter or click away to save, or
Escape to cancel. **Deck settings**, the circle button next to the
title, opens a modal for the title, description, and base CSS injected
into every slide's hidden head.

**Slide settings** opens the inspector for the current slide: title,
group, description, presenter notes, which of the HTML, CSS, and JS
columns start expanded in the side-by-side layout, and a design system
version to pin the slide to.

Edits save automatically, 500 milliseconds after you stop typing, with a
brief **Saved** indicator to confirm it. Leaving the editor — selecting
**Home**, closing the tab, or entering presentation mode — flushes
anything still pending first, so nothing is lost.

## Settings

The **Settings** button opens a modal with these controls. Changes apply
immediately, and **Done** closes the modal.

| Setting | What it does |
| --- | --- |
| Dark editor | Switches the code editors between a dark theme, the default, and a light one. The preview always shows the design system as it is. |
| Side by side editors | Switches between the three-column layout, the default, and tabs, which show one file at a time. |
| Editor font size | Small (13px), medium (15px), or large (18px). |
| Update preview | How soon an edit reaches the preview: on every pause in typing, only after a longer pause, or only when you ask. See Preview updates, below. |
| Show prerelease versions | Includes prerelease versions in the version selector. |
| Reset settings | Clears every remembered setting, back to the defaults. |

Each setting also has a URL query parameter, so a link can open the
playground configured a particular way. A parameter in the URL wins over
a remembered setting.

| Parameter | Values |
| --- | --- |
| `?theme=` | `light`, `dark` |
| `?editors=` | `tabs`, `columns` |
| `?font=` | `small`, `medium`, `large` |
| `?update=` | `typing`, `pause`, `manual` |

## Preview updates

By default, the preview rebuilds 800 milliseconds after you stop typing.
Set **Update preview** to a longer pause (2 seconds) when you want to
keep typing through small mistakes, or to manual to control every
rebuild yourself. Pressing Cmd+Enter or Ctrl+Enter, or Cmd+S or Ctrl+S,
rebuilds immediately in any mode, even in the middle of an edit. In
manual mode, an **Update preview** button appears in the corner of the
preview and reads "Update preview (changes pending)" once you have
unsaved edits.

## Presentation mode

Select **Present** in the editor toolbar, or **Present** on a deck card,
to present a deck. Presenting reuses the same layout: it hides the
toolbar and the slide-editing controls, requests fullscreen, and shows a
decorative NYSDS mark centered in the slide bar. In place of the
edit-only controls, the slide bar shows, in order, **Edit** (returns to
editing), presenter **Notes**, **Reset slide** (discards this session's
edits to the current slide and reloads what's saved), and **Settings**
(opens the settings modal without leaving the presentation). Opening a
deck with `?present=1` presents it directly. Escape exits presentation
mode, and leaves fullscreen with it.

Editing while presenting works the same as editing normally, but those
edits are ephemeral: they last only for the browser session, and leaving
presentation mode discards them and restores the saved slide, so a demo
can never damage the deck.

Because editing and presenting share one layout, most of these keyboard
shortcuts work throughout the app, not only while presenting — as long
as focus isn't inside an editor.

| Key | Action |
| --- | --- |
| Right arrow, down arrow, page down, space | Go to the next slide |
| Left arrow, up arrow, page up | Go to the previous slide |
| Home | Go to the first slide |
| End | Go to the last slide |
| Alt+arrow | Change slides even while the cursor is in an editor |
| `c` | Collapse or expand the editor drawer |
| `e` | Switch between the tabs and side-by-side editor layouts |
| `1`, `2`, `3` | Collapse or expand the HTML, CSS, or JS column (side-by-side layout only, and only when focus is outside the editors) |
| `t` | Switch the editor theme between light and dark |
| `n` | Show or hide presenter notes, when the slide has any |
| Escape | Close presenter notes, then exit presentation mode |

Escape needs two presses while you're mid-edit: the first is caught by
the code editor, and the second reaches presentation mode.

## Share

**Share** on a deck offers two links.

| Link | What it does |
| --- | --- |
| Copy link to this slide | A `?deck=<id>#preset=<slideId>` URL. Opens the same slide, but only in a browser that already holds this deck. |
| Copy standalone link | A `#code=<compressed JSON>` URL that carries the current HTML, CSS, JS, and version. Opens anywhere, in the **Scratch pad**. |

On the scratch pad, Share always copies a standalone link, and a
**Save as deck** button turns the current code into a new deck named
"Untitled" — the same no-prompt, select-to-rename behavior as **New
deck**. Opening a standalone link, or a bare `#preset=` link with no
`?deck=`, lands on the scratch pad; a bare URL with neither opens Home.

## Use the CLI

Installing dependencies also installs a `nysds-playground` command,
runnable through `npx nysds-playground` or the `npm start` and
`npm run present` scripts.

| Command | What it does |
| --- | --- |
| `nysds-playground` | Start the dev server and open Home. |
| `nysds-playground --deck library --preset button` | Open a specific slide in a deck already saved in this browser (a starter deck is seeded on first run). |
| `nysds-playground --deck library --present` | Present a deck. |
| `nysds-playground --html demo.html --css demo.css` | Open the scratch pad with local files loaded into the editors. |
| `nysds-playground link --html demo.html` | Print a shareable URL for a local file without starting a server. |
| `nysds-playground link --html demo.html --base https://its-hcd.github.io/nysds-playground/` | Print a link to the published site instead of a local server. |
| `nysds-playground --built` | Serve the production build in `dist/` with `vite preview`, instead of the dev server. |
| `nysds-playground --help` | List every command and flag. |

Other flags: `--js <file>`, `--version <v>` (used with `--html`,
`--css`, or `--js`; defaults to `latest`), `--dark`/`--light` and
`--columns`/`--tabs` (dark and columns are the app's own defaults, so
these are most useful to override a remembered setting), `--font
small|medium|large`, `--update typing|pause|manual`, `--port <n>`,
`--no-open`, and `--base <url>` (the origin `link` builds the URL
against). `bin/cli.mjs` is the source of truth for every flag; run
`nysds-playground --help` to see it.

`--deck <id>` and `--preset <id>` only work for a deck already in the
browser that opens the link — a bundled starter (seeded automatically on
first run), or one you created or imported earlier.

Run `npm link` from the repository to make `nysds-playground` available
globally on your machine.

### For Claude and other agents

To see a snippet render, write it to a file and run
`nysds-playground --html snippet.html`. To hand someone a URL instead of
opening a browser, run `nysds-playground link --html snippet.html` and
share the printed link. Either one opens the scratch pad, so it never
touches a saved deck.

## Starter decks and presets

`presets/*.json` and `decks/*.json` are starter content, bundled at
build time and used only to seed a browser's deck store — see Decks live
in your browser, above. `presets/` becomes the **Component library**
starter deck, one slide per file. Each file in `decks/` becomes its own
starter deck.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | Short name shown in the slide list. |
| `description` | string | yes | One sentence shown as the presentation caption. |
| `html` | string | yes | Body markup only. |
| `css` | string | yes | Custom styles, or an empty string. |
| `js` | string | yes | An ES module script, or an empty string. |
| `group` | string | no | A section label shown in the caption. |
| `notes` | string | no | Presenter notes, shown when you press `n`. |
| `version` | string | no | An NYSDS version to pin this slide to. |
| `editors` | string array | no | Which columns to expand in the side-by-side layout, for example `["html", "css"]`. Columns left out start collapsed. Ignored in the tabs layout. |

Name preset files `NN-slug.json`, for example `03-alert.json`. The
numeric prefix sets the display order. Name deck files `<id>.json`, for
example `customizing-components.json`; the filename becomes the starter deck's
id, and each slide inside the deck's `presets` array needs its own `id`.

The fastest way to build either is to shape it in the running app and
use **Export deck**, since there's no separate build step for starter
content.

- For a deck, create one in the app, add and edit its slides, then
  **Export deck**. The download already matches the `decks/<id>.json`
  shape — move it into `decks/` and rebuild.
- For a single preset, build a one-slide deck (the **Scratch pad**'s
  **Save as deck** button is the fastest way in), **Export deck**, then
  take the one object out of the downloaded file's `presets` array,
  drop its `id`, and save the rest as `presets/NN-slug.json`.

Either way, the file only reaches this browser's own store, and any
other browser, once you rebuild and it seeds fresh, or you select
**Restore starter decks** here. Check every icon name you use against
the list at https://designsystem.ny.gov/components/icon/, mirrored in
`src/icon-names.ts` and enforced by `npm test`. See `presets/README.md`
for the full authoring guide, including the deck format and a worked
example.

## Configure for another design system

All of the design-system-specific configuration lives in
`src/playground.config.ts`: the package names and dist paths to load, the
CDN base, the versions API, the default version, fallback versions, and
optional extra head HTML for fonts. To point the playground at a
different design system, edit that file and replace the contents of
`presets/` and `decks/`, the starter content new browsers seed from.

## Deploy

### GitHub Pages

A push to `main` runs `.github/workflows/deploy.yml`, which builds the
app and deploys `dist/` to GitHub Pages.

Before the first run can succeed, enable Pages with source "GitHub
Actions" on the repository:

```
gh api -X POST repos/ITS-HCD/nysds-playground/pages -f build_type=workflow
```

Because Vite's `base` is set to `./`, the build works whether Pages
serves it from a project path such as `/nysds-playground/` or from a
custom domain at the root.

### Google Cloud Run

Deploy the included `Dockerfile` directly from source:

```
gcloud run deploy nysds-playground --source . --region us-east4 --allow-unauthenticated
```

For a team-only deployment, replace `--allow-unauthenticated` with
`--no-allow-unauthenticated` and put the service behind Identity-Aware
Proxy or an internal load balancer.

### Any static host

Run `npm run build` and upload the contents of `dist/` to any static
file host or CDN.

## Architecture

The live preview runs on
[`playground-elements`](https://github.com/google/playground-elements),
which loads your code into a sandboxed iframe served from a separate
origin (unpkg.com hosts the playground service worker). Because the
preview never shares an origin with the playground itself, it's safe to
load arbitrary code from a share link without exposing the rest of the
page. The app has no backend: your decks live in IndexedDB in your own
browser, and all NYSDS assets load from jsDelivr at request time.

## Requirements and limitations

- The browser needs network access to `cdn.jsdelivr.net`,
  `data.jsdelivr.com`, and `unpkg.com`. Without it, the preview and
  version selector don't work.
- Decks live in IndexedDB and don't sync between browsers, devices, or
  private-browsing sessions. Export a deck before you clear site data or
  switch machines, and Import it wherever you need it next.
- NYSDS's licensed fonts (Proxima Nova and D Sari) aren't included, so
  the preview falls back to system fonts. For an internal deployment,
  host the font bundle on the same host as the playground, with
  permissive CORS headers, since the preview runs on a different origin.
  Then set `extraHeadHtml` in `src/playground.config.ts` to a
  `<link rel="stylesheet">` pointing at that bundle.
- The preview relies on service workers, and the deck store relies on
  IndexedDB, so the playground needs a browser that supports both. Every
  current major browser does.
