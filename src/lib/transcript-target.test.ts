import { describe, expect, it } from "vitest";
import { resolveTranscriptTarget } from "@/lib/transcript-target";

describe("transcript import target", () => {
  it("uses the currently selected matter and workspace", () => {
    expect(resolveTranscriptTarget({ matterId: "matter-1", workspaceId: "workspace-1" })).toEqual({
      matterId: "matter-1",
      workspaceId: "workspace-1",
    });
  });

  it("prefers an explicitly supplied new matter over stale selected state", () => {
    expect(
      resolveTranscriptTarget(
        { matterId: null, workspaceId: "workspace-1" },
        { matterId: "matter-new", workspaceId: "workspace-1" },
      ),
    ).toEqual({ matterId: "matter-new", workspaceId: "workspace-1" });
  });

  it("rejects an import without a matter", () => {
    expect(() => resolveTranscriptTarget({ matterId: null, workspaceId: "workspace-1" })).toThrow(
      "Choose a matter before importing a transcript.",
    );
  });

  it("rejects an import without a workspace", () => {
    expect(() => resolveTranscriptTarget({ matterId: "matter-1", workspaceId: null })).toThrow(
      "No workspace selected",
    );
  });
});
