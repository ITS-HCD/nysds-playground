/**
 * The quiet-period debounce that decides when the preview rebuilds.
 *
 * It takes its clock as an argument so `src/state.test.ts` can drive it with a
 * fake one instead of waiting in real time.
 */

/** The timer functions the debounce needs. */
export interface Clock {
  setTimeout(handler: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

/** A debounce that runs `fn` once the calls stop for `delay` milliseconds. */
export interface QuietDebounce {
  /** Notes an edit. Schedules `fn` unless the delay is `null`. */
  schedule(): void;
  /** Runs `fn` now and drops anything scheduled. */
  flush(): void;
  /** Drops anything scheduled without running `fn`. */
  cancel(): void;
  /** Changes the quiet period. `null` stops automatic runs. */
  setDelay(delay: number | null): void;
  /** Whether a run is waiting. */
  readonly pending: boolean;
}

/**
 * Creates a debounce that waits for a pause rather than firing eagerly.
 *
 * A `null` delay means the caller triggers every run itself, which is what the
 * playground's "Manually" update mode does.
 */
export function createQuietDebounce(
  fn: () => void,
  delay: number | null,
  clock: Clock = globalThis as unknown as Clock,
): QuietDebounce {
  let handle: number | undefined;
  let currentDelay = delay;
  let waiting = false;

  const cancel = (): void => {
    if (handle !== undefined) {
      clock.clearTimeout(handle);
      handle = undefined;
    }
  };

  const start = (): void => {
    cancel();
    if (currentDelay === null) {
      return;
    }
    handle = clock.setTimeout(() => {
      handle = undefined;
      waiting = false;
      fn();
    }, currentDelay);
  };

  return {
    schedule(): void {
      waiting = true;
      start();
    },
    flush(): void {
      cancel();
      waiting = false;
      fn();
    },
    cancel(): void {
      cancel();
      waiting = false;
    },
    setDelay(next: number | null): void {
      currentDelay = next;
      if (waiting) {
        start();
      }
    },
    get pending(): boolean {
      return waiting;
    },
  };
}
