/**
 * The order a client's key documents are read in.
 *
 * Alphabetical is a filing system nobody chose. The firm's order is a good
 * default; the client's own order beats it, because where the constitution
 * sits on the shelf is a judgement about them.
 */
import { describe, expect, it } from "vitest";
import { categoryLabel, KNOWN_CATEGORIES, shelfOrder } from "./model";

describe("shelfOrder", () => {
  it("puts the firm's order in front when the client has said nothing", () => {
    expect(shelfOrder([], ["policy", "constitution"]).slice(0, 3)).toEqual([
      "constitution",
      "certificate",
      "register",
    ]);
  });

  it("follows the client's own order first", () => {
    const order = shelfOrder(["licence", "policy"], ["constitution", "policy", "licence"]);
    expect(order.slice(0, 2)).toEqual(["licence", "policy"]);
    // And everything the firm knows about is still there, after it.
    expect(order).toContain("constitution");
  });

  it("finds a place for a shelf the client named themselves", () => {
    const order = shelfOrder([], ["Trust deeds", "constitution", "Tax rulings"]);
    // After the built-in shelves, in the order a reader would look for them.
    const own = order.filter((c) => c === "Trust deeds" || c === "Tax rulings");
    expect(own).toEqual(["Tax rulings", "Trust deeds"]);
    expect(order.indexOf("Tax rulings")).toBeGreaterThan(order.indexOf("constitution"));
  });

  it("never lists a shelf twice, however it was named", () => {
    const order = shelfOrder(["policy", "policy"], ["policy", "policy"]);
    expect(order.filter((c) => c === "policy")).toHaveLength(1);
    expect(new Set(order).size).toBe(order.length);
  });

  it("keeps every built-in shelf, so the picker is never short of one", () => {
    const order = shelfOrder(["Trust deeds"], []);
    for (const known of KNOWN_CATEGORIES) expect(order).toContain(known);
  });
});

describe("categoryLabel", () => {
  it("uses the firm's words for a known shelf and the client's for their own", () => {
    expect(categoryLabel("constitution")).toBe("Constitutions");
    expect(categoryLabel("Trust deeds")).toBe("Trust deeds");
    expect(categoryLabel(null)).toBe("Uncategorised");
  });
});
