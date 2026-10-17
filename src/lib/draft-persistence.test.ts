import { describe, expect, it } from "vitest";
import {
  draftFingerprint,
  restoreDraft,
  shapeDraftList,
  type DraftRow,
  type SaveableDraft,
} from "./draft-persistence";

const row = (patch: Partial<DraftRow> = {}): DraftRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "00000000-0000-4000-8000-000000000010",
  matter_id: "00000000-0000-4000-8000-000000000020",
  title: "Liability cap",
  body: "The aggregate liability shall not exceed the Fees.",
  source: "ai",
  agreement_type: "MSA",
  clause_category: "Liability",
  jurisdiction: "England & Wales",
  sector: "Technology",
  risk_position: "Preferred",
  created_by: "00000000-0000-4000-8000-000000000030",
  created_at: "2026-09-08T09:00:00.000Z",
  updated_at: "2026-09-08T10:00:00.000Z",
  matters: { name: "Laine MSA" },
  ...patch,
});

describe("draft restore boundary", () => {
  it("restores every persisted drafting field and no transient session history", () => {
    expect(restoreDraft(row())).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000010",
      matterId: "00000000-0000-4000-8000-000000000020",
      title: "Liability cap",
      body: "The aggregate liability shall not exceed the Fees.",
      provenance: "ai",
      filters: {
        agreementType: "MSA",
        clauseCategory: "Liability",
        jurisdiction: "England & Wales",
        sector: "Technology",
        riskPosition: "Preferred",
      },
      createdBy: "00000000-0000-4000-8000-000000000030",
      createdAt: "2026-09-08T09:00:00.000Z",
      updatedAt: "2026-09-08T10:00:00.000Z",
      historyAvailable: false,
    });
  });

  it("uses honest empty UI values for nullable persisted fields", () => {
    const restored = restoreDraft(
      row({
        matter_id: null,
        source: "human",
        agreement_type: null,
        clause_category: null,
        jurisdiction: null,
        sector: null,
        risk_position: null,
      }),
    );
    expect(restored.matterId).toBe("");
    expect(restored.provenance).toBe("user");
    expect(restored.filters).toEqual({
      agreementType: "",
      clauseCategory: "",
      jurisdiction: "",
      sector: "",
      riskPosition: "",
    });
    expect(restored).not.toHaveProperty("request");
    expect(restored).not.toHaveProperty("guidance");
    expect(restored).not.toHaveProperty("lastAction");
  });
});

describe("draft list shaping", () => {
  it("orders newest first with a stable id tie-break and shapes matter joins", () => {
    const rows = [
      row({
        id: "b",
        updated_at: "2026-09-08T10:00:00.000Z",
        matters: [{ name: "  Matter B  " }],
      }),
      row({ id: "a", updated_at: "2026-09-08T10:00:00.000Z", matters: null }),
      row({ id: "older", updated_at: "2026-09-07T10:00:00.000Z" }),
    ];

    const items = shapeDraftList(rows);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "older"]);
    expect(items[0]?.matterName).toBeNull();
    expect(items[1]?.matterName).toBe("Matter B");
  });

  it("collapses whitespace and bounds the list preview", () => {
    const [item] = shapeDraftList([row({ body: `  ${"word ".repeat(40)}\nend  ` })]);
    expect(item?.bodyPreview).not.toMatch(/\s{2,}|\n/);
    expect(item?.bodyPreview.endsWith("…")).toBe(true);
    expect(item?.bodyPreview.length).toBeLessThanOrEqual(120);
  });
});

describe("draft save fingerprint", () => {
  const saveable: SaveableDraft = {
    workspaceId: "workspace",
    matterId: null,
    title: "Title",
    body: "Body",
    source: "human",
    agreementType: null,
    clauseCategory: null,
    jurisdiction: null,
    sector: null,
    riskPosition: null,
  };

  it("changes when a persisted classification changes", () => {
    expect(draftFingerprint(saveable)).not.toBe(
      draftFingerprint({ ...saveable, jurisdiction: "Ghana" }),
    );
  });
});
