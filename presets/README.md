# Presets and decks

`presets/*.json` and `decks/*.json` are starter content. They aren't
loaded directly by the running app — the first time the playground opens
in a browser, it copies them into that browser's own deck store (see
`src/starters.ts`), and after that the app reads only from the store.
Every file in `presets/` becomes one slide of a starter deck called
**Component library**, in filename order. Every file in `decks/` becomes
its own starter deck. Selecting **Restore starter decks** on the home
page adds back any starter deck a browser is missing, including changes
you make here after rebuilding.

## Preset schema

Each file in `presets/` is a JSON object with these fields.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | Short name shown in the slide list and the presentation caption. |
| `description` | string | yes | One sentence shown as the presentation caption. |
| `html` | string | yes | Body markup only. The app wraps it with the head that loads NYSDS. |
| `css` | string | yes | Custom styles for the preview. Use an empty string if none. |
| `js` | string | yes | An ES module that runs in the preview. Use an empty string if none. |
| `group` | string | no | A section label shown in the caption, such as `1. Lock it down`. |
| `notes` | string | no | Presenter notes. Press `n` to read them. Never shown in the preview. |
| `version` | string | no | An NYSDS version to pin this slide to. Omit it, or use `latest`, to follow the app's default version. |
| `editors` | string array | no | Which columns to expand in the side-by-side layout, for example `["html", "css"]`. Columns left out start collapsed. Ignored in the tabs layout. |

Don't put an `id` field in a file in this directory. The id comes from
the filename instead.

## Naming and ordering

Name files `NN-slug.json`, for example `01-button.json` or
`12-form-validation.json`. The numeric prefix sets the order slides
appear in the Component library deck. The slug becomes the slide's id.

## Author in the browser, then export

There's no separate build step for a preset, so the fastest way to write
one is to shape it as a deck in the running app, then pull the slide back
out.

1. On the home page, select **Scratch pad**, or open any deck and add a
   slide.
2. Use the HTML, CSS, and JS editors to build the example, and **Slide
   settings** to set its title, description, group, notes, version, and
   starting columns.
3. From the scratch pad, select **Save as deck** first, since only a
   saved deck can be exported.
4. Select **Export deck** in the toolbar. It downloads a JSON file shaped
   like [Decks](#decks), below, with one slide in its `presets` array.
5. Copy that one slide object out of the `presets` array, delete its
   `id` field, and save the rest as `presets/NN-slug.json`.
6. Rebuild, or select **Restore starter decks** in a browser that already
   seeded, to pick up the new file.

## Decks

A deck bundles several slides into one presentation, with its own title
and description. Add a starter deck by creating `decks/<id>.json`; the
filename without its extension becomes the deck's id.

```json
{
  "title": "Customizing components",
  "description": "One sentence describing the deck.",
  "boilerplate": {
    "baseCss": "body { padding: 2rem; }"
  },
  "presets": [
    {
      "id": "01-header-drop-in",
      "group": "1. Lock it down",
      "title": "Drop in the header",
      "notes": "Presenter-only notes for this slide.",
      "html": "<nys-globalheader appName=\"Example\" nysLogo></nys-globalheader>",
      "css": "",
      "js": ""
    }
  ]
}
```

A deck's `presets` array holds full slide objects, using the same fields
as the preset schema, with one difference: each slide needs its own `id`,
because it isn't loaded from a file of its own. `boilerplate.baseCss` is
CSS injected into the hidden preview head for every slide in the deck —
use it for shared layout, such as the `.stage` and `.card` helper classes
in `decks/customizing-components.json`. Don't set `boilerplate.head`: the
playground ignores it and logs a console warning, because the version
selector, not the deck, controls what the preview loads.

Building a starter deck is simpler than building a preset, because
**Export deck** already writes this exact shape: create the deck in the
app, add and arrange its slides, select **Export deck**, and move the
downloaded file into `decks/` under the filename you want as its id.
`decks/customizing-components.json` is a full worked example.

## Validation tips

- Run `npm run build` after adding a preset or a deck. `tsc --noEmit`
  catches malformed JSON and a broken build catches most other mistakes.
- Check every component attribute you use against
  `mcp__nysds__validate_component_api` before committing a preset. Don't
  read `node_modules/@nysds` for this — use the NYSDS MCP server.
- Keep examples short. Presentation mode puts the editors in a drawer
  over the bottom of the preview, and a slide that needs scrolling to
  read from the back of a room is too long.

## Icons

NYSDS ships only a curated subset of Material Symbols. An icon name
outside that set renders as empty space. Check the list at
https://designsystem.ny.gov/components/icon/ (mirrored in
`src/icon-names.ts`) before using `icon`, `prefixIcon`, `suffixIcon`,
or `<nys-icon name>`. `npm test` fails on unknown icon names in any
preset or deck.
