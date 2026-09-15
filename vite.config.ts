import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {defineConfig, type Plugin} from 'vite';

const require = createRequire(import.meta.url);

/**
 * Files that `playground-elements` loads at runtime through a relative
 * `new URL(..., import.meta.url)` reference rather than a static import.
 *
 * `playground-project.js` starts the TypeScript worker with
 * `new URL('./playground-typescript-worker.js', import.meta.url)`, and that
 * worker imports `./internal/typescript.js`. Rollup may or may not rewrite the
 * `new URL` call into a hashed asset, so copy both files next to the emitted
 * chunks. The relative lookup then resolves either way.
 */
const RUNTIME_WORKER_FILES = [
  {
    from: 'playground-elements/playground-typescript-worker.js',
    to: 'assets/playground-typescript-worker.js',
  },
  {
    from: 'playground-elements/internal/typescript.js',
    to: 'assets/internal/typescript.js',
  },
];

/** Copies the playground TypeScript worker and its dependency into `dist`. */
function copyPlaygroundWorker(): Plugin {
  return {
    name: 'copy-playground-worker',
    apply: 'build',
    generateBundle() {
      for (const file of RUNTIME_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: file.to,
          source: readFileSync(require.resolve(file.from)),
        });
      }
    },
  };
}

export default defineConfig({
  // Relative asset URLs keep the build portable to GitHub Pages project sites.
  base: './',
  plugins: [copyPlaygroundWorker()],
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    // Serve playground-elements unbundled in dev so its relative worker URL
    // resolves against /node_modules/playground-elements/.
    exclude: ['playground-elements'],
  },
});
