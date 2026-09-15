# Presets and decks

A preset is a saved example that loads into the editor tabs. Every file in
this directory becomes a slide of the built-in **Library** deck, in
filename order. A deck is a named, ordered set of slides for a
presentation — see [Decks](#decks) for its format. Both are bundled at
build time through `import.meta.glob`, so adding either one means adding
a file and rebuilding.

## Preset schema

Each file in this directory is a JSON object with these fields.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | string | yes | Short name shown in the preset list and the presentation caption. |
| `description` | string | yes | One sentence shown as the presentation caption. |
| `html` | string | yes | Body markup only. The app wraps it with the head that loads NYSDS. |
| `css` | string | yes | Custom styles for the preview. Use an empty string if none. |
| `js` | string | yes | An ES module that runs in the preview. Use an empty string if none. |
| `group` | string | no | A section label shown in the caption, such as `1. Lock it down`. |
| `notes` | string | no | Presenter notes. Press `n` in presentation mode to read them. Never shown in the preview. |
| `version` | string | no | An NYSDS version to pin this preset to. Omit it, or use `latest`, to follow the app's default version. |
| `editors` | string array | no | Which columns to expand in the side-by-side layout, for example `["html", "css"]`. Columns left out start collapsed. Ignored in the tabs layout. |

Don't put an `id` field in a file in this directory. The id comes from
the filename instead.

## Naming and ordering

Name files `NN-slug.json`, for example `01-button.json` or
`12-form-validation.json`. The numeric prefix sets the order presets
appear in the picker and in presentation mode. The slug becomes the
preset's id and shows up in share links as `#preset=<id>`, so keep it
stable once you share a link to it.

## Author in the browser, then export

The fastest way to build a preset is to write it in the running app.

1. Open the playground and use the HTML, CSS, and JS tabs to build the
   example.
2. Pick the NYSDS version you want the preset pinned to, if any.
3. Select **Export preset** in the toolbar. It downloads a JSON file in
   the schema above, with your current editor state, title, description,
   group, and notes filled in.
4. Rename the download to `NN-slug.json`, adjust the `title` and
   `description`, and move it into this directory.
5. Rebuild the app so the new file is picked up.

## Decks

A deck bundles several slides into one presentation, with its own
transitions between slides and a title of its own. Add one by creating
`decks/<id>.json`; the filename without its extension becomes the deck's
id and shows up in `?deck=<id>`.

```json
{
  "title": "Three levels of strictness",
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
in `decks/styling-levels.json`. Don't set `boilerplate.head`: the
playground ignores it and logs a console warning, because the version
selector, not the deck, controls what the preview loads.

To build a deck, author each slide in the running app, use **Export
preset** to get its JSON, add an `id`, and append it to the deck's
`presets` array. `decks/styling-levels.json` is a full worked example.

## Validation tips

- Run `npm run build` after adding a preset or a deck. `tsc --noEmit`
  catches malformed JSON and a broken build catches most other mistakes.
- Check every component attribute you use against
  `mcp__nysds__validate_component_api` before committing a preset. Don't
  read `node_modules/@nysds` for this — use the NYSDS MCP server.
- Keep examples short. Presentation mode puts the editors below the
  preview, and a slide that needs scrolling to read from the back of a
  room is too long.

## Icons

NYSDS ships only a curated subset of Material Symbols. An icon name
outside that set renders as empty space. Check the list at
https://designsystem.ny.gov/components/icon/ (mirrored in
`src/icon-names.ts`) before using `icon`, `prefixIcon`, `suffixIcon`,
or `<nys-icon name>`. `npm test` fails on unknown icon names in any
preset or deck.
