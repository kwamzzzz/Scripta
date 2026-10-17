import { describe, expect, it } from "vitest";
import { workspaceLabel } from "./workspaces";

/**
 * The switcher has to make the two kinds unmistakable. A personal workspace
 * that showed its stored name would read as a firm called after a person —
 * which is exactly the confusion this correction exists to remove, and exactly
 * what a firm's matters were sitting inside.
 */
describe("how a workspace is named on screen", () => {
  it("never shows a personal workspace's stored name", () => {
    expect(workspaceLabel({ name: "Mawusi", kind: "personal" })).toBe("Personal");
    expect(workspaceLabel({ name: "anything at all", kind: "personal" })).toBe("Personal");
  });

  it("names a firm, because a person may belong to more than one", () => {
    expect(workspaceLabel({ name: "Nexis Africa", kind: "firm" })).toBe("Nexis Africa");
  });

  it("keeps the two visibly different even when the names collide", () => {
    const personal = workspaceLabel({ name: "Nexis Africa", kind: "personal" });
    const firm = workspaceLabel({ name: "Nexis Africa", kind: "firm" });
    expect(personal).not.toBe(firm);
  });
});
