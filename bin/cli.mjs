#!/usr/bin/env node
/**
 * Command-line entry point for the NYSDS Playground.
 *
 * Starts the playground and opens it in your browser, or prints a share link
 * for local HTML, CSS, and JS files. Run `nysds-playground --help` for usage.
 *
 * The hash format matches `src/state.ts`: `#code=` carries an lz-string
 * compressed JSON object with the keys `v`, `h`, `c`, and `j`.
 */
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import LZString from 'lz-string';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 5173;
const PREVIEW_PORT = 4173;

const HELP = `NYSDS Playground

Usage
  nysds-playground [open] [options]   Start the playground and open a browser tab
  nysds-playground link [options]     Print a playground URL without starting a server
  nysds-playground help               Show this help

Options
  --preset <id>       Open a preset by id (for example: button)
  --deck <id>         Open a deck by id (for example: styling-levels)
  --present           Open in presentation mode
  --dark              Use the dark editor theme (default)
  --light             Use the light editor theme
  --columns           Show the HTML, CSS, and JS editors side by side (default)
  --tabs              Show the editors as tabs instead of columns
  --font <size>       Editor font size: small, medium, or large
  --update <mode>     When the preview rebuilds: typing, pause, or manual
  --html <file>       Load an HTML file into the HTML tab
  --css <file>        Load a CSS file into the CSS tab
  --js <file>         Load a JavaScript file into the JS tab
  --version <v>       Design system version for --html/--css/--js links (default: latest)
  --port <n>          Port for the local server (default: ${DEFAULT_PORT})
  --built             Serve the production build in dist/ instead of the dev server
  --no-open           Start the server without opening a browser
  --base <url>        Base URL for the link command (default: http://localhost:${DEFAULT_PORT}/)

Examples
  nysds-playground                          Open the library deck
  nysds-playground --preset modal           Open the modal preset
  nysds-playground --deck styling-levels --present --dark
  nysds-playground --html demo.html --css demo.css
  nysds-playground link --html demo.html    Print a shareable URL for demo.html
`;

/** Parses argv into a command name and typed options. */
function parseCli(argv) {
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      preset: {type: 'string'},
      deck: {type: 'string'},
      present: {type: 'boolean', default: false},
      dark: {type: 'boolean', default: false},
      light: {type: 'boolean', default: false},
      columns: {type: 'boolean', default: false},
      tabs: {type: 'boolean', default: false},
      font: {type: 'string'},
      update: {type: 'string'},
      html: {type: 'string'},
      css: {type: 'string'},
      js: {type: 'string'},
      version: {type: 'string', default: 'latest'},
      port: {type: 'string'},
      built: {type: 'boolean', default: false},
      open: {type: 'boolean', default: true},
      base: {type: 'string'},
      help: {type: 'boolean', short: 'h', default: false},
    },
  });
  const command = positionals[0] ?? 'open';
  return {command, options: values};
}

/** Reads a file argument, or returns an empty string when it isn't given. */
async function readOptional(path) {
  if (!path) {
    return '';
  }
  return readFile(resolve(process.cwd(), path), 'utf8');
}

/**
 * Builds the path, query, and hash that select what the playground shows.
 *
 * File options win over `--preset` because they carry explicit content.
 */
async function buildLocation(options) {
  const query = new URLSearchParams();
  if (options.deck) {
    query.set('deck', options.deck);
  }
  if (options.present) {
    query.set('present', '1');
  }
  if (options.light) {
    query.set('theme', 'light');
  } else if (options.dark) {
    query.set('theme', 'dark');
  }
  if (options.tabs) {
    query.set('editors', 'tabs');
  } else if (options.columns) {
    query.set('editors', 'columns');
  }
  if (options.font) {
    if (!['small', 'medium', 'large'].includes(options.font)) {
      throw new Error(`--font must be small, medium, or large (got "${options.font}").`);
    }
    query.set('font', options.font);
  }
  if (options.update) {
    if (!['typing', 'pause', 'manual'].includes(options.update)) {
      throw new Error(`--update must be typing, pause, or manual (got "${options.update}").`);
    }
    query.set('update', options.update);
  }
  let hash = '';
  if (options.html || options.css || options.js) {
    const [html, css, js] = await Promise.all([
      readOptional(options.html),
      readOptional(options.css),
      readOptional(options.js),
    ]);
    const payload = JSON.stringify({v: options.version, h: html, c: css, j: js});
    hash = `#code=${LZString.compressToEncodedURIComponent(payload)}`;
  } else if (options.preset) {
    hash = `#preset=${encodeURIComponent(options.preset)}`;
  }
  const search = query.size > 0 ? `?${query.toString()}` : '';
  return `/${search}${hash}`;
}

/** Prints a URL for the given options without starting a server. */
async function link(options) {
  const port = options.port ? Number(options.port) : DEFAULT_PORT;
  const base = options.base ?? `http://localhost:${port}/`;
  const location = await buildLocation(options);
  const url = new URL(location, base);
  process.stdout.write(`${url.toString()}\n`);
}

/** Starts the dev server or the production preview and opens the browser. */
async function open(options) {
  const location = await buildLocation(options);
  const vite = await import('vite');
  const port = options.port ? Number(options.port) : options.built ? PREVIEW_PORT : DEFAULT_PORT;
  const openTarget = options.open ? location : false;

  if (options.built) {
    const server = await vite.preview({
      root: ROOT,
      configFile: resolve(ROOT, 'vite.config.ts'),
      preview: {port, strictPort: false, open: openTarget},
    });
    server.printUrls();
    return;
  }

  const server = await vite.createServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vite.config.ts'),
    server: {port, strictPort: false, open: openTarget},
  });
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({print: true});
}

async function main() {
  const {command, options} = parseCli(process.argv.slice(2));
  if (options.help || command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  switch (command) {
    case 'open':
      await open(options);
      break;
    case 'link':
      await link(options);
      break;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
