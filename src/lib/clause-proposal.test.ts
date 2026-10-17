/**
 * Accepted wording becomes somebody's proposal, or it does not happen.
 *
 * Every server-side writer of clause wording used to write `clause_segments`
 * and nothing else, so wording accepted from an AI suggestion or an amendment
 * never reached `clauses.doc` — the document the export, the Changes pane, the
 * four readings and the Playbook review all read. Found in the clause-workflow
 * acceptance review.
 */
import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "@/wireframe/clause-doc";
import { changesIn } from "@/wireframe/tracked-change";
import { proposedDoc } from "@/wireframe/segments-to-marks";
import { proposeIntoDoc } from "./clause-proposal";

const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";
const THEM = "176d2a8c-10f1-429b-82f2-dde207c99a68";

const flat = (text: string): ClauseDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** A stand-in for the supabase client, recording what reached the server. */
const recorder = (error: unknown = null) => {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error });
    },
  };
};

const clause = (doc: ClauseDoc | null) => ({
  id: "c-1",
  doc,
  updated_at: "2026-09-16T09:00:00.000Z",
});

describe("putting accepted wording into the document", () => {
  const redline = [
    { t: "Payment within ", k: "n" as const },
    { t: "sixty", k: "d" as const },
    { t: "thirty", k: "i" as const },
    { t: " days.", k: "n" as const },
  ];

  it("saves it through save_clause_doc, in the accepting lawyer's name", async () => {
    const db = recorder();
    await proposeIntoDoc(db as never, clause(flat("Payment within sixty days.")), ME, redline, "x");

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]!.fn).toBe("save_clause_doc");
    const sent = db.calls[0]!.args["_doc"] as ClauseDoc;
    const changes = changesIn(sent);
    expect(changes).toHaveLength(2);
    for (const change of changes) expect(change.authorId).toBe(ME);
    expect(changes.map((c) => c.kind).sort()).toEqual(["deletion", "insertion"]);
  });

  it("sends the clause's read-time stamp, so a colleague's write is not overwritten", async () => {
    const db = recorder();
    await proposeIntoDoc(db as never, clause(flat("Payment within sixty days.")), ME, redline, "x");
    expect(db.calls[0]!.args["_seen"]).toBe("2026-09-16T09:00:00.000Z");
  });

  it("refuses rather than settling a colleague's proposal by omission", async () => {
    const theirs: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Payment within " },
            {
              type: "text",
              text: "sixty",
              marks: [
                {
                  type: "insertion",
                  attrs: { changeId: "c1", setId: "s1", authorId: THEM, at: "2026-09-16" },
                },
              ],
            },
            { type: "text", text: " days." },
          ],
        },
      ],
    };
    const db = recorder();
    await expect(
      proposeIntoDoc(db as never, clause(theirs), ME, redline, "accepting a suggestion"),
    ).rejects.toThrow(/proposals outstanding/i);
    // Nothing was sent. A refusal must not leave a half-written clause.
    expect(db.calls).toHaveLength(0);
  });

  it("refuses rather than flattening a clause that carries formatting", async () => {
    const formatted: ClauseDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Payment within " },
            { type: "text", text: "sixty", marks: [{ type: "bold" }] },
            { type: "text", text: " days." },
          ],
        },
      ],
    };
    const db = recorder();
    await expect(
      proposeIntoDoc(db as never, clause(formatted), ME, redline, "accepting a suggestion"),
    ).rejects.toThrow(/formatting/i);
    expect(db.calls).toHaveLength(0);
  });

  it("carries a refusal from the server out, rather than reporting success", async () => {
    const db = recorder({ message: "That clause is not yours to edit." });
    await expect(
      proposeIntoDoc(db as never, clause(flat("Payment within sixty days.")), ME, redline, "x"),
    ).rejects.toThrow("That clause is not yours to edit.");
  });

  it("still writes a clause the migration never converted", async () => {
    const db = recorder();
    await proposeIntoDoc(db as never, clause(null), ME, redline, "x");
    expect(db.calls).toHaveLength(1);
  });
});

describe("a redline proposed as one sitting", () => {
  it("shares a set id, so accepting the whole suggestion is one decision", () => {
    const doc = proposedDoc(
      [
        { t: "a ", k: "n" },
        { t: "b", k: "d" },
        { t: "c", k: "i" },
      ],
      { authorId: ME, setId: "sitting-1", at: "2026-09-16T09:00:00.000Z" },
    );
    const changes = changesIn(doc);
    expect(new Set(changes.map((c) => c.setId)).size).toBe(1);
    // ...and keeps separate change ids, or an insertion and a deletion would
    // merge into one entry wearing whichever kind was seen first.
    expect(new Set(changes.map((c) => c.changeId)).size).toBe(2);
  });
});
