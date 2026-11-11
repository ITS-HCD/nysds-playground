# Presets and decks

`presets/*.json` and `decks/*.json` are starter content. They aren't
loaded directly by the running app — the first time the playground opens
in a browser, it copies them into that browser's own deck store (see
`src/starters.ts`), and after that the app reads only from the store.
Every file in `presets/` becomes one slide of a starter deck called
**Component library**, in filename order. Every file in `decks/` becomes
its own starter deck. Each starter deck seeds once per browser, so a
deleted starter stays deleted, and a new file in `decks/` still seeds
once after you rebuild. Selecting **Restore starter decks** on the home
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
| `editors` | string array | no | Which columns to expand in the side-by-side layout, for example `["html", "css"]`. Columns left out start collapsed. Applies to that slide only; a slide without it shows the columns you chose. Ignored in the tabs layout. |

Don't put an `id` field in a file in this directory. The id comes from
the filename instead.

## Build slides with the design system

A slide demonstrates the design system, so it should look like it. Slides
built from NYSDS pieces also keep working when the version or theme
changes. Build each slide in this order:

1. **Components.** Use `nys-*` components for anything a design system
   plausibly ships, such as cards, buttons, alerts, tables, and tabs.
   Search with `mcp__nysds__find_components` first.
2. **Utility classes.** Use `nys-*` classes for layout and spacing: the
   12-column grid (`nys-grid-row`, `nys-grid-col-*`), flex
   (`nys-display-flex`, `nys-flex-gap-*`), margin and padding
   (`nys-margin-b-*`, `nys-padding-*`), type roles (`nys-font-*`), and
   responsive prefixes (`nys-tablet:`, `nys-desktop:`). Look them up with
   `mcp__nysds__get_utility_classes`.
3. **Tokens.** When the first two can't express a style, write custom CSS
   that reads `var(--nys-…)` tokens. Look them up with
   `mcp__nysds__find_tokens`.

Don't invent a parallel class system, such as `g-slide` or `g-card`, and
don't hard-code colors, font sizes, or spacing. Custom CSS is fine when
the slide's point is customization, as in
`decks/customizing-components.json`, or when you build something the
system doesn't ship, such as a diagram. Keep it on tokens even then.

For example, this slide uses a homegrown layer:

```html
<main class="g-slide">
  <h1 class="g-title">Where we stand</h1>
  <div class="g-grid g-grid--3">
    <section class="g-card">
      <p class="g-stat">~8 weeks</p>
      <p>From first commit to production for Click to Renew</p>
    </section>
  </div>
</main>
```

It needs custom CSS for `g-slide`, `g-grid`, `g-card`, and `g-stat`.
This version uses NYSDS utilities for the layout:

```html
<div class="nys-grid-container nys-padding-y-400">
  <h1 class="nys-font-h1 nys-margin-b-400">Where we stand</h1>
  <div class="nys-grid-row nys-grid-gap-300">
    <div class="nys-grid-col-12 nys-tablet:nys-grid-col-6 nys-desktop:nys-grid-col-4">
      <p class="stat">
        <span class="stat__value">~8 weeks</span>
        from first commit to production for Click to Renew, which launched
        on NYSDS on October 28
      </p>
    </div>
    <!-- more columns -->
  </div>
</div>
```

NYSDS has no stat or metric component, so the stat is custom. Don't use
a heading or a component's `heading` for the number: a number isn't a
section title, and screen reader users navigate by headings. A paragraph
reads as one sentence, and a few lines of CSS on tokens style it:

```css
.stat {
  margin: 0;
  padding-inline-start: var(--nys-space-200);
  border-inline-start: var(--nys-border-width-lg) solid var(--nys-color-theme);
}

.stat__value {
  display: block;
  font-family: var(--nys-font-family-display);
  font-size: var(--nys-font-size-display-md);
  font-weight: var(--nys-font-weight-bold);
  line-height: var(--nys-font-lineheight-display-md);
}
```

When several slides in a deck show stats, put these rules in the deck's
**Base CSS** in **Deck settings** rather than repeating them on each
slide.

### Link to the docs

When a slide covers something that has a page on designsystem.ny.gov,
end the slide's HTML with one small link to that page, so anyone who
wants to learn more can click through:

```html
<p class="nys-font-body-sm nys-margin-t-500"><a href="https://designsystem.ny.gov/components/button/" target="_blank" rel="noopener">Button docs</a></p>
```

- For one topic, write the link text as the topic plus "docs", such as
  "Button docs" or "Tokens docs".
- For two or more topics, start the same paragraph with "Docs:" and make
  each topic its own link, separated by " · ". The link text is the topic
  alone, and the "Docs:" label gives every link its context:

  ```html
  <p class="nys-font-body-sm nys-margin-t-500">Docs: <a href="https://designsystem.ny.gov/components/table/" target="_blank" rel="noopener">Table</a> · <a href="https://designsystem.ny.gov/components/pagination/" target="_blank" rel="noopener">Pagination</a></p>
  ```
- Keep `target="_blank"`. It opens the page in a new tab and leaves the
  slide in the preview.
- Put the link last in the slide's content. Don't position it with
  `fixed` or `absolute`. If the slide wraps its content in a container,
  put the link at the end of that container.
- Before you use a URL, confirm that it returns 200:
  `curl -s -o /dev/null -w "%{http_code}" -L <url>`. Component pages
  live at `/components/<name>/`, such as `/components/button/`. If a
  topic has no page, leave the link off.

## Naming and ordering

Name files `NN-slug.json`, for example `01-button.json` or
`11-form-validation.json`. The numeric prefix sets the order slides
appear in the Component library deck. The slug becomes the slide's id,
so keep the slug when you renumber a file.

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
6. Rebuild. A browser that already has the **Component library** deck
   keeps its copy, so delete that deck and select **Restore starter
   decks** to pick up the new file.

## Decks

A deck bundles several slides into one presentation, with its own title
and description. Add a starter deck by creating `decks/<id>.json`; the
filename without its extension becomes the deck's id.

```json
{
  "title": "Customizing components",
  "description": "One sentence describing the deck.",
  "boilerplate": {
    "baseCss": "body { padding: var(--nys-space-400); }"
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
use it for shared layout, such as the `.stage` helper class in
`decks/customizing-components.json`. Don't set `boilerplate.head`: the
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
- Check that the slide follows
  [Build slides with the design system](#build-slides-with-the-design-system):
  no custom layout classes, and no hard-coded colors, sizes, or spacing
  unless the slide demonstrates customization.
- Check that the slide ends with a docs link in the form
  [Link to the docs](#link-to-the-docs) describes, when the topic has a
  page.
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
