/**
 * The sentence that decides whether a lawyer waits.
 *
 * Small, but it is the only real computation on the client side of the lease:
 * everything else about who may do what is answered by the database. A wrong
 * word here sends somebody away from a clause that was about to free itself.
 */
import { describe, expect, it } from "vitest";
import { freesIn } from "./ClausePresence";

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

describe("how long until a clause frees itself", () => {
  it("says any moment now once the lease has lapsed", () => {
    expect(freesIn(inSeconds(-30))).toBe("any moment now");
    expect(freesIn(inSeconds(0))).toBe("any moment now");
  });

  it("counts the last half-minute in seconds, because that is worth waiting out", () => {
    expect(freesIn(inSeconds(10))).toBe("in a few seconds");
    expect(freesIn(inSeconds(29))).toBe("in a few seconds");
  });

  it("calls anything under a minute and a half about a minute", () => {
    expect(freesIn(inSeconds(45))).toBe("in about a minute");
    expect(freesIn(inSeconds(89))).toBe("in about a minute");
  });

  it("rounds the rest to whole minutes, never showing a ticking number", () => {
    expect(freesIn(inSeconds(115))).toBe("in about 2 minutes");
  });

  /* A lease row with no expiry is not a state the database produces, but the
     value arrives as a string over the wire and the component must not render
     "in about NaN minutes" at a lawyer. */
  it("says something sane when the date is unreadable", () => {
    expect(freesIn("not a date")).toBe("any moment now");
  });
});
