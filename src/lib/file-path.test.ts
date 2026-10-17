import { describe, expect, it } from "vitest";
import { filePath } from "./files";

/**
 * These assertions are load-bearing for Phase 3.
 *
 * The storage policy that will gate the bucket on matter membership reads the
 * MATTER OUT OF THE SECOND PATH SEGMENT. If an attachment is ever written to a
 * path whose second segment is not the matter id, that file silently escapes
 * the confidentiality boundary — and nothing else in the product would notice.
 */
const WS = "d832b081-cf82-4dc0-a5b9-b0241fe50d9b";
const MATTER = "c0c2b172-4856-4e84-bf40-fafe7f9dee42";
const USER = "6df711b6-27b0-4aaf-8129-ef39700de7bb";

const segments = (p: string) => p.split("/");

describe("where an attachment is filed", () => {
  it("puts a matter's file under the matter, as segment two", () => {
    const p = filePath({ workspaceId: WS, matterId: MATTER }, "att1", "Share Purchase.docx");
    expect(segments(p)[0]).toBe(WS);
    expect(segments(p)[1]).toBe(MATTER);
    expect(segments(p)).toHaveLength(3);
  });

  it("keeps a file with no matter out of the matter namespace", () => {
    const p = filePath({ workspaceId: WS, matterId: null, userId: USER }, "att2", "notes.pdf");
    expect(segments(p)[1]).toBe("personal");
    expect(segments(p)[2]).toBe(USER);
    // "personal" is not a uuid, so the policy can never read it as a matter.
    expect(segments(p)[1]).not.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("files an unfiled flow's attachment under the flow, where the policy asks the flow", () => {
    const FLOW = "9b79d290-94a6-48fd-8984-4096a8c9ade1";
    const p = filePath({ workspaceId: WS, matterId: null, flowId: FLOW }, "att4", "draft.pdf");
    expect(segments(p).slice(0, 3)).toEqual([WS, "flows", FLOW]);
    // Not a uuid in segment two, so it can never be read as a matter.
    expect(segments(p)[1]).not.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("prefers the matter once a flow is filed to one", () => {
    const FLOW = "9b79d290-94a6-48fd-8984-4096a8c9ade1";
    const p = filePath({ workspaceId: WS, matterId: MATTER, flowId: FLOW }, "att5", "x.pdf");
    expect(segments(p)[1]).toBe(MATTER);
  });

  it("still files a personal attachment somewhere rather than nowhere", () => {
    const p = filePath({ workspaceId: WS, matterId: null }, "att3", "x.txt");
    expect(segments(p)[2]).toBe("unfiled");
  });

  /* A space or a comma in an object key is enough for a signed URL to come back
     with the wrong thing. The readable name lives on the record, not the key. */
  it("scrubs the filename into something safe to be an object key", () => {
    const p = filePath({ workspaceId: WS, matterId: MATTER }, "att4", "Draft v2, final (1).docx");
    const key = segments(p)[2] ?? "";
    expect(key).toMatch(/^att4-/);
    expect(key).not.toMatch(/[ ,()]/);
    expect(key.endsWith(".docx")).toBe(true);
  });

  it("never produces an empty key for a file with no usable name", () => {
    const p = filePath({ workspaceId: WS, matterId: MATTER }, "att5", "");
    expect(segments(p)[2]).toBe("att5-file");
  });

  it("keeps the id in front, so two files of the same name cannot collide", () => {
    const a = filePath({ workspaceId: WS, matterId: MATTER }, "one", "report.docx");
    const b = filePath({ workspaceId: WS, matterId: MATTER }, "two", "report.docx");
    expect(a).not.toBe(b);
  });
});
