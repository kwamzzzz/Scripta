/**
 * Comparing two versions of a clause.
 *
 * The assertion this file exists for is C1: A COMPARISON REBUILDS BOTH TEXTS
 * EXACTLY. A diff that loses a word — a space, a quotation mark, a "not" — is
 * worse than no diff at all, because a lawyer reads it and believes it.
 */
import { describe, expect, it } from "vitest";
import { compareText, differs } from "./clause-compare";

const before = (parts: { text: string; kind: string }[]) =>
  parts
    .filter((p) => p.kind !== "added")
    .map((p) => p.text)
    .join("");
const after = (parts: { text: string; kind: string }[]) =>
  parts
    .filter((p) => p.kind !== "removed")
    .map((p) => p.text)
    .join("");

describe("comparing two versions", () => {
  /* C1, run over every case in this file. */
  const roundTrips = (a: string, b: string) => {
    const parts = compareText(a, b);
    expect(before(parts)).toBe(a);
    expect(after(parts)).toBe(b);
    return parts;
  };

  it("finds a word that was put in", () => {
    const parts = roundTrips("The Seller shall deliver.", "The Seller shall promptly deliver.");
    expect(parts.filter((p) => p.kind === "added").map((p) => p.text.trim())).toEqual(["promptly"]);
  });

  it("finds a word that was taken out", () => {
    const parts = roundTrips("The Seller shall promptly deliver.", "The Seller shall deliver.");
    expect(parts.filter((p) => p.kind === "removed").map((p) => p.text.trim())).toEqual([
      "promptly",
    ]);
  });

  it("finds a word that was swapped", () => {
    const parts = roundTrips("payable in Cedis", "payable in Dollars");
    expect(parts.some((p) => p.kind === "removed" && p.text.includes("Cedis"))).toBe(true);
    expect(parts.some((p) => p.kind === "added" && p.text.includes("Dollars"))).toBe(true);
  });

  /* The word a comparison must never lose. */
  it("catches a negation being dropped", () => {
    const parts = roundTrips("The Seller shall not assign.", "The Seller shall assign.");
    expect(parts.some((p) => p.kind === "removed" && p.text.includes("not"))).toBe(true);
  });

  it("says nothing changed when nothing changed", () => {
    const parts = roundTrips("The Seller shall deliver.", "The Seller shall deliver.");
    expect(differs(parts)).toBe(false);
    expect(parts).toHaveLength(1);
  });

  it("keeps whitespace exactly, including the awkward kinds", () => {
    roundTrips("clause  1.2\n\n(a) first", "clause  1.2\n\n(a) second");
  });

  it("handles one side being empty", () => {
    roundTrips("", "New wording.");
    roundTrips("Old wording.", "");
  });

  it("runs consecutive changes together rather than emitting one part per word", () => {
    const parts = roundTrips("a b c d", "a x y d");
    expect(parts.filter((p) => p.kind === "removed")).toHaveLength(1);
    expect(parts.filter((p) => p.kind === "added")).toHaveLength(1);
  });

  /* A pasted schedule would make the table enormous. It declines to compute
     rather than locking the browser — and still round-trips, which is what
     keeps the fallback honest. */
  it("declines gracefully on a document too large to diff word by word", () => {
    const huge = "word ".repeat(120_000);
    const parts = roundTrips(huge, huge + "extra");
    expect(differs(parts)).toBe(true);
  });
});
