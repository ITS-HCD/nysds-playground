# NYSDS Playground

NYSDS Playground is a static web app for trying out New York State Design
System (NYSDS) components in the browser. You write HTML, CSS, and
JavaScript in three editor tabs and see a live preview, then share what
you built as a URL.

Live URL: https://its-hcd.github.io/nysds-playground/ (after Pages is
enabled — see Deploy).

## Quick start

Prerequisites: Node.js 20 or newer.

1. Clone the repository and change into it.
2. Run `npm install`.
3. Run `npm start`.

`npm start` runs the CLI, which starts the dev server on port 5173 and
opens a browser tab. See Use the CLI for other ways to run it.

## Use the playground

- **HTML, CSS, and JS tabs**: edit the body markup, styles, and an ES
  module script. The app wraps your HTML with the head markup that loads
  NYSDS, so you write only the content.
- **Editor layout**: switch between tabs, which show one file at a time,
  and side-by-side columns, which show all three at once. Each column has
  a collapse button; a collapsed column becomes a thin labeled strip you
  click to expand.
- **Deck select**: appears in the toolbar once a named deck exists
  alongside the built-in Library. Switches which set of slides the
  preset picker and presentation mode step through.
- **Version selector**: choose the NYSDS version the preview loads. The
  list comes from the jsDelivr data API at runtime, with a hardcoded
  fallback if that request fails. Choosing `latest`, or a version the
  CDN doesn't list, resolves to the newest stable release.
- **Settings**: opens a modal with dark editor theme, side-by-side
  editors, editor font size, when the preview updates, and whether the
  version selector lists prereleases. See Settings, below.
- **Share**: copies a URL that encodes your current HTML, CSS, JS, and
  selected version, so anyone who opens it sees exactly what you built.
- **Export preset**: downloads your current editor state as a JSON file
  in the preset schema, ready to drop into `presets/`.
- **Reset**: clears the editors back to a blank starting point.
- **Present**: enters presentation mode for showing presets to an
  audience.

## Settings

The **Settings** button at the right of the toolbar opens a modal with
these controls. Changes apply immediately, and **Done** closes the
modal.

| Setting | What it does |
| --- | --- |
| Dark editor | Switches the code editors between a light and a dark theme. The preview always shows the design system as it is. |
| Side by side editors | Switches between the tabs layout and the three-column layout. |
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

## Use the CLI

Installing dependencies also installs a `nysds-playground` command,
runnable through `npx nysds-playground` or the `npm start` and
`npm run present` scripts.

| Command | What it does |
| --- | --- |
| `nysds-playground` | Start the dev server and open the Library deck. |
| `nysds-playground --preset button` | Open a specific preset by id. |
| `nysds-playground --deck styling-levels --present --dark` | Open a deck in presentation mode, with the dark editor theme. |
| `nysds-playground --html demo.html --css demo.css` | Load local files into the editors. |
| `nysds-playground link --html demo.html` | Print a shareable URL for a local file without starting a server. |
| `nysds-playground --built` | Serve the production build in `dist/` with `vite preview`, instead of the dev server. |
| `nysds-playground --help` | List every command and flag. |

Other flags: `--js <file>`, `--version <v>` (used with `--html`,
`--css`, or `--js`; defaults to `latest`), `--columns` (side-by-side
editors), `--font small|medium|large`, `--update typing|pause|manual`,
`--port <n>`, `--no-open`, and `--base <url>` (the origin `link` builds
the URL against). `bin/cli.mjs` is the source of truth for every flag;
run `nysds-playground --help` to see it.

Run `npm link` from the repository to make `nysds-playground` available
globally on your machine.

### For Claude and other agents

To see a snippet render, write it to a file and run
`nysds-playground --html snippet.html`. To hand someone a URL instead of
opening a browser, run `nysds-playground link --html snippet.html` and
share the printed link.

## Share links

The playground encodes state in the URL, so links work without a
server.

| Format | What it does |
| --- | --- |
| `#code=<compressed JSON>` | Loads arbitrary HTML, CSS, JS, and a version from a compressed `{v,h,c,j}` payload. This is what Share produces. |
| `#preset=<id>` | Loads an unmodified preset or deck slide by its id. |
| `?deck=<id>` | Selects a named deck. Omit it for the Library deck. |
| `?present=1` | Opens in presentation mode. |

`?theme=`, `?editors=`, `?font=`, and `?update=` also work on any link.
See Settings, above.

## Presentation mode

Open the playground with `?present=1` to fill most of the screen with the
preview. The editors float in a drawer over the bottom of the slide,
still live and editable, so the presenter can change a slide without
leaving the deck. Drag the divider to resize the drawer, from 15% to 85%
of the slide's height; resizing the drawer never reflows the slide
itself. A caption bar shows the slide's group and title, its position as
`n / N`, previous and next buttons, and a **Reset slide** button that
discards edits made during the session and restores the original preset.

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

Plain arrow keys, Home, End, and the letter keys move between slides only
when focus is outside the editors, so typing in an editor doesn't
accidentally advance the deck. Escape needs two presses while you're
mid-edit: the first is caught by the code editor, and the second reaches
presentation mode. Edits you make on a slide last for the browser
session; reloading or reopening the link restores the original preset.
The URL's `#preset=<id>` updates on each step, so a link copied mid-talk
resumes there. Share still produces a `#code=` link and keeps
`present=1` if it was set.

## Add a preset or a deck

A preset is a JSON file in `presets/`, and becomes a slide of the
built-in Library deck. A deck is a JSON file in `decks/` that bundles its
own ordered set of slides for a presentation. Both are bundled at build
time, so adding either one means adding a file and rebuilding.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | Short name shown in the preset list. |
| `description` | string | yes | One sentence shown as the presentation caption. |
| `html` | string | yes | Body markup only. |
| `css` | string | yes | Custom styles, or an empty string. |
| `js` | string | yes | An ES module script, or an empty string. |
| `group` | string | no | A section label shown in the caption. |
| `notes` | string | no | Presenter notes, shown when you press `n`. |
| `version` | string | no | An NYSDS version to pin this preset to. |
| `editors` | string array | no | Which columns to expand in the side-by-side layout, for example `["html", "css"]`. Columns left out start collapsed. Ignored in the tabs layout. |

Name preset files `NN-slug.json`, for example `03-alert.json`. The
numeric prefix sets the display order, and the slug becomes the preset's
id in `#preset=<id>` links. Name deck files `<id>.json`, for example
`styling-levels.json`; the filename becomes the deck's id in `?deck=<id>`
links, and each slide inside the deck's `presets` array needs its own
`id` field.

To create a preset, build the example in the running app, select
**Export preset**, rename the downloaded file to `NN-slug.json`, move it
into `presets/`, and rebuild. Check every icon name you use against the
list at https://designsystem.ny.gov/components/icon/, mirrored in
`src/icon-names.ts` and enforced by `npm test`. See `presets/README.md`
for the full authoring guide, including the deck format and a worked
example.

## Configure for another design system

All of the design-system-specific configuration lives in
`src/playground.config.ts`: the package names and dist paths to load, the
CDN base, the versions API, the default version, fallback versions, and
optional extra head HTML for fonts. To point the playground at a
different design system, edit that file and replace the contents of
`presets/` and `decks/`.

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
page. The app has no backend: all state lives in the URL, and all NYSDS
assets load from jsDelivr at request time.

## Requirements and limitations

- The browser needs network access to `cdn.jsdelivr.net`,
  `data.jsdelivr.com`, and `unpkg.com`. Without it, the preview and
  version selector don't work.
- NYSDS's licensed fonts (Proxima Nova and D Sari) aren't included, so
  the preview falls back to system fonts. For an internal deployment,
  host the font bundle on the same host as the playground, with
  permissive CORS headers, since the preview runs on a different origin.
  Then set `extraHeadHtml` in `src/playground.config.ts` to a
  `<link rel="stylesheet">` pointing at that bundle.
- The preview relies on service workers, so it needs a browser that
  supports them. Every current major browser does.
