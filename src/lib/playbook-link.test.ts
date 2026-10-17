import { describe, expect, it } from "vitest";
import { offerable } from "./playbook-link";

const row = (over: Record<string, unknown> = {}) => ({
  id: "pb1",
  name: "Logistics services — supplier side",
  status: "Active",
  archived_at: null,
  deleted_at: null,
  playbook_rules: [],
  ...over,
});

describe("the playbooks a matter can be put on", () => {
  it("does not offer one the firm has retired", () => {
    const list = offerable([
      row({ id: "live" }),
      row({ id: "archived", archived_at: "2026-01-01" }),
      row({ id: "deleted", deleted_at: "2026-01-01" }),
    ]);
    expect(list.map((p) => p.id)).toEqual(["live"]);
  });

  /* The count on screen is the one that decides whether a review is worth
     running. A heading with no stance reviews nothing. */
  it("counts a position as written only when it says where the firm stands", () => {
    const [only] = offerable([
      row({
        playbook_rules: [
          { preferred: "Payment within 30 days." },
          { preferred: "   " },
          { preferred: null },
          { preferred: "Cap at 12 months of charges." },
        ],
      }),
    ]);
    expect(only!.total).toBe(4);
    expect(only!.written).toBe(2);
  });

  it("says nothing is written when a playbook is all headings", () => {
    const [only] = offerable([
      row({ playbook_rules: [{ preferred: null }, { preferred: "" }] }),
    ]);
    expect(only!.written).toBe(0);
    expect(only!.total).toBe(2);
  });

  it("never shows a nameless playbook as a blank line", () => {
    expect(offerable([row({ name: "" })])[0]!.name).toBe("Untitled playbook");
    expect(offerable([row({ name: "   " })])[0]!.name).toBe("Untitled playbook");
  });
});
