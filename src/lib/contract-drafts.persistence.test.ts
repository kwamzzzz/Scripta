import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  calls: [] as { method: string; args: unknown[] }[],
  replies: [] as { data?: unknown; error?: unknown }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: (...args: unknown[]) => step("select", args),
    insert: (...args: unknown[]) => step("insert", args),
    update: (...args: unknown[]) => step("update", args),
    delete: (...args: unknown[]) => step("delete", args),
    eq: (...args: unknown[]) => step("eq", args),
    is: (...args: unknown[]) => step("is", args),
    in: (...args: unknown[]) => step("in", args),
    order: (...args: unknown[]) => step("order", args),
    single: () => Promise.resolve(database.replies.shift()),
    maybeSingle: () => Promise.resolve(database.replies.shift()),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(database.replies.shift()).then(resolve),
  };
  function step(method: string, args: unknown[]) {
    database.calls.push({ method, args });
    return query;
  }
  return { supabase: { from: (table: string) => step("from", [table]) } };
});

import {
  archiveContractDrafts,
  createContractDraft,
  deleteContractDraft,
  emptyContractDraft,
  getContractDraft,
  markContractDraftAccepted,
  updateContractDraft,
} from "./contract-drafts";

const row = {
  id: "draft",
  workspace_id: "workspace",
  matter_id: null,
  title: "Unfinished title ",
  agreement_type: "Services",
  governing_law: "",
  instructions: "An unfinished brief ",
  stage: "brief",
  plan: null,
  outcomes: [],
  accepted_at: null,
  accepted_matter_id: null,
  archived_at: null,
  created_by: null,
  created_at: "today",
  updated_at: "today",
  matters: null,
  accepted_matter: null,
};

beforeEach(() => {
  database.calls.length = 0;
  database.replies.length = 0;
});

describe("contract draft persistence boundaries", () => {
  it("inserts the full unfinished snapshot without losing whitespace or optional context", async () => {
    database.replies.push({ data: row, error: null });
    const content = {
      ...emptyContractDraft(),
      title: row.title,
      agreementType: row.agreement_type,
      instructions: row.instructions,
    };
    await createContractDraft("workspace", content);
    expect(database.calls.find((call) => call.method === "insert")?.args[0]).toMatchObject({
      workspace_id: "workspace",
      matter_id: null,
      title: row.title,
      agreement_type: "Services",
      governing_law: "",
      instructions: row.instructions,
      stage: "brief",
      plan: null,
      outcomes: [],
    });
  });

  it("scopes writes to the workspace and refuses to overwrite accepted or archived work", async () => {
    database.replies.push({ data: null, error: null });
    await expect(updateContractDraft("draft", "workspace", emptyContractDraft())).rejects.toThrow(
      "accepted, archived or removed",
    );
    expect(database.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["workspace_id", "workspace"] },
        { method: "eq", args: ["id", "draft"] },
        { method: "is", args: ["accepted_at", null] },
        { method: "is", args: ["archived_at", null] },
      ]),
    );
    const patch = database.calls.find((call) => call.method === "update")?.args[0];
    expect(patch).not.toHaveProperty("accepted_at");
    expect(patch).not.toHaveProperty("archived_at");
    expect(patch).not.toHaveProperty("workspace_id");
  });

  it("returns missing records as missing and propagates plain database failures", async () => {
    database.replies.push({ data: null, error: null });
    expect(await getContractDraft("draft", "workspace")).toBeNull();
    const error = { message: "Database unavailable", code: "08006" };
    database.replies.push({ data: null, error });
    await expect(getContractDraft("draft", "workspace")).rejects.toBe(error);
  });

  it("retries a completed acceptance stamp idempotently without changing the existing time", async () => {
    database.replies.push(
      { data: null, error: null },
      {
        data: { ...row, accepted_at: "original-time", accepted_matter_id: "matter" },
        error: null,
      },
    );
    const accepted = await markContractDraftAccepted("draft", "workspace", "matter");
    expect(accepted.acceptedAt).toBe("original-time");
    expect(
      database.calls
        .filter((call) => call.method === "from")
        .every((call) => call.args[0] === "contract_drafts"),
    ).toBe(true);
    expect(database.calls).toContainEqual({ method: "is", args: ["accepted_at", null] });
  });

  it("does not silently point an already accepted draft at a different matter", async () => {
    database.replies.push(
      { data: null, error: null },
      {
        data: { ...row, accepted_at: "original-time", accepted_matter_id: "other-matter" },
        error: null,
      },
    );
    await expect(markContractDraftAccepted("draft", "workspace", "matter")).rejects.toThrow(
      "acceptance could not be recorded",
    );
  });

  it("archives through the shared helper and deletes only draft rows", async () => {
    database.replies.push({ error: null }, { error: null });
    await archiveContractDrafts(["draft"], false);
    expect(database.calls).toContainEqual({ method: "update", args: [{ archived_at: null }] });
    expect(database.calls).toContainEqual({ method: "in", args: ["id", ["draft"]] });
    database.calls.length = 0;
    await deleteContractDraft("draft", "workspace");
    expect(database.calls.filter((call) => call.method === "from")).toEqual([
      { method: "from", args: ["contract_drafts"] },
    ]);
    expect(database.calls).toContainEqual({ method: "eq", args: ["workspace_id", "workspace"] });
  });
});
