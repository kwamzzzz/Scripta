/**
 * A promise that is not allowed to hang for ever.
 *
 * A screen waiting on a call that never comes back shows a spinner and nothing
 * else: no error, no retry, no explanation. The Final tab did exactly that on
 * the deployed app — the document load stalled, the query has no retry, and
 * what a lawyer saw was an empty contract with no letterhead control and no
 * preview, as though the matter held nothing at all.
 *
 * A deadline turns that into something a person can act on: a sentence saying
 * what timed out, and a button to try again. It does not cancel the work —
 * there is nothing useful to cancel a fetch to here — it only stops the screen
 * pretending to wait.
 */
export class Overdue extends Error {
  constructor(what: string, seconds: number) {
    super(`${what} did not come back within ${seconds} seconds. Try again.`);
    this.name = "Overdue";
  }
}

export function withDeadline<T>(work: Promise<T>, seconds: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const bell = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new Overdue(what, seconds)), seconds * 1000);
  });
  return Promise.race([work, bell]).finally(() => clearTimeout(timer)) as Promise<T>;
}
