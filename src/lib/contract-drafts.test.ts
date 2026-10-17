import { describe, expect, it } from "vitest";
import {
  contractDraftContent,
  contractDraftFingerprint,
  contractDraftMatchesView,
  contractDraftStageLabel,
  emptyContractDraft,
  errorMessage,
  readContractDraft,
  resumableContractOutcomes,
} from "./contract-drafts";
import type { Tables } from "@/integrations/supabase/types";

const plan = {
  agreementType: "Services",
  governingLaw: "",
  clauses: [
    { num: "1", title: "Services", purpose: "Define the work" },
    { num: "2", title: "Payment", purpose: "Define payment" },
  ],
};

describe("contract draft library state", () => {
  it("labels each stage, and keeps acceptance even when its matter was deleted", () => {
    expect(
      ["brief", "plan", "draft"].map((stage) =>
        contractDraftStageLabel({
          stage: stage as "brief" | "plan" | "draft",
          acceptedAt: null,
        }),
      ),
    ).toEqual(["Brief", "Plan agreed", "Drafting"]);
    expect(contractDraftStageLabel({ stage: "draft", acceptedAt: "2026-09-13" })).toBe("Accepted");
  });

  it("hides archived work from both working views, including accepted archived drafts", () => {
    for (const acceptedAt of [null, "2026-09-13"]) {
      const live = { stage: "draft" as const, acceptedAt, archivedAt: null };
      expect(contractDraftMatchesView(live, "All")).toBe(true);
      expect(contractDraftMatchesView(live, "Accepted")).toBe(!!acceptedAt);
      expect(contractDraftMatchesView(live, "Archived")).toBe(false);
      const archived = { ...live, archivedAt: "2026-09-14" };
      expect(contractDraftMatchesView(archived, "All")).toBe(false);
      expect(contractDraftMatchesView(archived, "Accepted")).toBe(false);
      expect(contractDraftMatchesView(archived, "Archived")).toBe(true);
    }
  });
});

describe("contract draft recovery", () => {
  it("keeps a plain database rejection readable instead of implying an empty library", () => {
    expect(
      errorMessage({ message: "Permission denied", details: "Internal detail", hint: "SQL hint" }),
    ).toBe("Permission denied");
    expect(errorMessage({ message: "", details: "The draft was removed" })).toBe(
      "The draft was removed",
    );
    expect(errorMessage(null, "Could not load drafts.")).toBe("Could not load drafts.");
  });
  it("keeps successful wording and makes only missing outcomes retryable after an interrupted run", () => {
    const success = {
      num: "1",
      title: "Services",
      ok: true as const,
      text: "Lawyer's revised wording",
    };
    const restored = resumableContractOutcomes({
      ...emptyContractDraft(),
      stage: "draft",
      plan,
      outcomes: [success],
    });
    expect(restored[0]).toBe(success);
    expect(restored[1]).toMatchObject({ num: "2", title: "Payment", ok: false });
    expect(resumableContractOutcomes({ ...emptyContractDraft(), stage: "plan", plan })).toEqual([]);
  });

  it("fingerprints every editable field, excluding lifecycle metadata", () => {
    const draft = { ...emptyContractDraft(), stage: "plan" as const, plan };
    expect(contractDraftContent({ ...draft, ...{ acceptedAt: "today" } })).toEqual(draft);
    expect(contractDraftFingerprint({ ...draft, instructions: "new instruction" })).not.toBe(
      contractDraftFingerprint(draft),
    );
    expect(contractDraftFingerprint({ ...draft, stage: "draft" })).not.toBe(
      contractDraftFingerprint(draft),
    );
  });

  const row: Tables<"contract_drafts"> & { matters: null; accepted_matter: null } = {
    id: "draft",
    deleted_at: null,
    workspace_id: "workspace",
    matter_id: null,
    title: "",
    agreement_type: "Services",
    governing_law: "",
    instructions: "Unfinished instruction ",
    stage: "plan",
    plan,
    outcomes: [],
    accepted_at: null,
    accepted_matter_id: null,
    archived_at: null,
    created_by: null,
    created_at: "2026-09-13",
    updated_at: "2026-09-13",
    matters: null,
    accepted_matter: null,
  };

  it("reads actual JSON without trimming work or inventing a title", () => {
    expect(readContractDraft(row)).toMatchObject({
      title: "",
      instructions: "Unfinished instruction ",
      stage: "plan",
      plan,
    });
    expect(readContractDraft({ ...row, accepted_at: "2026-09-14" }).acceptedAt).toBe("2026-09-14");
  });

  it("refuses malformed saved work instead of replacing it with an empty draft", () => {
    for (const patch of [
      { stage: "unknown" },
      { plan: null },
      { plan: { clauses: [] } },
      { outcomes: [{ ok: true }] },
    ])
      expect(() => readContractDraft({ ...row, ...patch })).toThrow("unreadable saved work");
  });
});
