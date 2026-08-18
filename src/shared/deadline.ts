/**
 * deadline.ts — bounding a promise in time.
 *
 * Some waits are worse than failures: a screengrab lookup holds the whole screen while it reads
 * ([lookup.ts](../../electron/lookup.ts)), so "slow forever" is not an outcome it can offer. This is
 * the one place that turns an unbounded promise into a bounded one.
 */

/** Thrown when a promise misses its deadline, so callers can tell a timeout from a real failure. */
export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * `promise`, unless `ms` elapses first — then this rejects with a `TimeoutError` and whatever the
 * promise eventually does is ignored. `what` names the wait, for the message.
 *
 * The underlying work is *not* cancelled (a promise can't be); it is only stopped from being waited
 * on. Callers who own a resource the abandoned work still holds are responsible for discarding it.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
    // Handlers are attached unconditionally, so losing the race can't leave an unhandled
    // rejection behind; settling twice is a no-op.
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e as Error);
      },
    );
  });
}
