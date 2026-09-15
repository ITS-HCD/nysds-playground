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
- **Deck select**: appears in the toolbar once a named deck exists
  alongside the built-in Library. Switches which set of slides the
  preset picker and presentation mode step through.
- **Version selector**: choose the NYSDS version the preview loads. The
  list comes from the jsDelivr data API at runtime, with a hardcoded
  fallback if that request fails. Choosing `latest`, or a version the
  CDN doesn't list, resolves to the newest stable release.
- **Share**: copies a URL that encodes your current HTML, CSS, JS, and
  selected version, so anyone who opens it sees exactly what you built.
- **Export preset**: downloads your current editor state as a JSON file
  in the preset schema, ready to drop into `presets/`.
- **Reset**: reloads the current preset's starting HTML, CSS, and JS,
  discarding your edits.
- **Present**: enters presentation mode for showing presets to an
  audience.

## Use the CLI

Installing dependencies also installs a `nysds-playground` command,
runnable through `npx nysds-playground` or the `npm start` and
`npm run present` scripts.

| Command | What it does |
| --- | --- |
| `nysds-playground` | Start the dev server and open the Library deck. |
| `nysds-playground --preset button` | Open a specific preset by id. |
| `nysds-playground --deck styling-levels --present` | Open a deck in presentation mode. |
| `nysds-playground --html demo.html --css demo.css` | Load local files into the editors. |
| `nysds-playground link --html demo.html` | Print a shareable URL for a local file without starting a server. |
| `nysds-playground --built` | Serve the production build in `dist/` with `vite preview`, instead of the dev server. |
| `nysds-playground --help` | List every command and flag. |

Other flags: `--js <file>`, `--version <v>` (used with `--html`,
`--css`, or `--js`; defaults to `latest`), `--port <n>`, `--no-open`, and
`--base <url>` (the origin `link` builds the URL against).

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

## Presentation mode

Open the playground with `?present=1` to put the preview across roughly
the top two-thirds of the screen, with the HTML, CSS, and JS editors
below it, still live and editable. A caption bar shows the slide's
group and title, its position as `n / N`, previous and next buttons, and
a **Reset slide** button that discards edits made during the session and
restores the original preset.

| Key | Action |
| --- | --- |
| Right arrow, down arrow, page down, space | Go to the next slide |
| Left arrow, up arrow, page up | Go to the previous slide |
| Home | Go to the first slide |
| End | Go to the last slide |
| Alt+arrow | Change slides even while the cursor is in an editor |
| `c` | Collapse or expand the editor pane |
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

Name preset files `NN-slug.json`, for example `03-alert.json`. The
numeric prefix sets the display order, and the slug becomes the preset's
id in `#preset=<id>` links. Name deck files `<id>.json`, for example
`styling-levels.json`; the filename becomes the deck's id in `?deck=<id>`
links, and each slide inside the deck's `presets` array needs its own
`id` field.

To create a preset, build the example in the running app, select
**Export preset**, rename the downloaded file to `NN-slug.json`, move it
into `presets/`, and rebuild. See `presets/README.md` for the full
authoring guide, including the deck format and a worked example.

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
