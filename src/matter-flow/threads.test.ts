import { describe, expect, it } from "vitest";
import { blankFixture } from "./fixtures";
import {
  deliverableMatches,
  deliverableSearchText,
  emailDraftFor,
  isEmailDeliverable,
  searchableText,
  threadWhen,
  threadsFor,
  type Deliverable,
  type MatterFlowRecord,
  type ThreadEntry,
} from "./model";

const deliverable = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: "d1",
  phaseId: "p1",
  kind: "action",
  name: "Mandate confirmation from WAGAS",
  type: "email",
  description: "WAGAS confirms Part A, Part B or both.",
  owner: "MKA",
  start: "2026-09-14",
  deadline: "2026-09-18",
  mandatory: true,
  ticked: false,
  ...over,
});

const entry = (over: Partial<ThreadEntry> = {}): ThreadEntry => ({
  id: "t1",
  deliverableId: "d1",
  author: "Kofi Mensah",
  text: "Confirmed — we proceed with Part A only.",
  searchText: searchableText("Confirmed — we proceed with Part A only."),
  attachments: [],
  createdAt: "2026-09-15T09:00:00.000Z",
  ...over,
});

const record = (over: Partial<MatterFlowRecord> = {}): MatterFlowRecord => ({
  ...blankFixture("m1"),
  deliverables: [deliverable()],
  ...over,
});

describe("isEmailDeliverable", () => {
  it("is an action carried out by email, nothing else", () => {
    expect(isEmailDeliverable(deliverable())).toBe(true);
    expect(isEmailDeliverable(deliverable({ type: "call" }))).toBe(false);
    expect(isEmailDeliverable(deliverable({ kind: "document", type: "letter" }))).toBe(false);
  });
});

describe("searchableText", () => {
  it("folds case, punctuation and whitespace", () => {
    expect(searchableText("Confirmed —  we PROCEED\n\twith Part A only.")).toBe(
      "confirmed we proceed with part a only",
    );
  });

  it("keeps what a keyword search needs: addresses, figures, hyphens", () => {
    const folded = searchableText("Invoice INV-2291 to kofi.mensah@wagas.com for 12,500 USD");
    expect(folded).toContain("inv-2291");
    expect(folded).toContain("kofi.mensah@wagas.com");
    expect(folded).toContain("12 500");
  });

  it("straightens the quotes mail clients insert, so a word folds one way only", () => {
    expect(searchableText("We don’t agree")).toBe(searchableText("We don't agree"));
    expect(searchableText("“Agreed”, he said")).toBe("agreed he said");
  });
});

describe("threadsFor", () => {
  it("returns only this deliverable's replies", () => {
    const r = record({ threads: [entry(), entry({ id: "t2", deliverableId: "other" })] });
    expect(threadsFor(r, "d1").map((t) => t.id)).toEqual(["t1"]);
  });

  it("reads oldest first, by when the reply arrived", () => {
    const r = record({
      threads: [
        entry({ id: "late", receivedAt: "2026-09-20T10:00" }),
        entry({ id: "early", receivedAt: "2026-09-16T08:30" }),
        entry({ id: "middle", receivedAt: "2026-09-18T12:00" }),
      ],
    });
    expect(threadsFor(r, "d1").map((t) => t.id)).toEqual(["early", "middle", "late"]);
  });

  it("falls back to when it was logged if the reply carries no date", () => {
    const r = record({
      threads: [
        entry({ id: "dated", receivedAt: "2026-09-14T09:00" }),
        entry({ id: "undated", createdAt: "2026-09-19T09:00:00.000Z" }),
      ],
    });
    expect(threadsFor(r, "d1").map((t) => t.id)).toEqual(["dated", "undated"]);
    expect(threadWhen(entry({ createdAt: "x" }))).toBe("x");
  });

  it("is empty for a record written before threads existed", () => {
    expect(threadsFor(record(), "d1")).toEqual([]);
    expect(emailDraftFor(record(), "d1")).toBeNull();
  });
});

describe("deliverableSearchText", () => {
  const derived = (over: Partial<MatterFlowRecord> = {}) => {
    const r = record(over);
    return {
      name: deliverable().name,
      description: deliverable().description,
      threads: threadsFor(r, "d1"),
      emailDraft: emailDraftFor(r, "d1"),
    };
  };
  const source = {
    emails: [
      {
        deliverableId: "d1",
        to: "kofi.mensah@wagas.com",
        subject: "Mandate confirmation — Part A and Part B",
        body: "Please confirm which mandates you wish to proceed with.",
        updatedAt: "2026-09-14T09:00:00.000Z",
      },
    ],
    threads: [
      entry({
        text: "Part A only for now. The Liberia module can wait until the concession is renewed.",
        searchText: searchableText(
          "Part A only for now. The Liberia module can wait until the concession is renewed.",
        ),
        attachments: [
          { id: "a1", name: "Concession renewal notice.pdf", fileRef: "idb:a1", bytes: 10, mime: "application/pdf" },
        ],
      }),
    ],
  };
  const text = deliverableSearchText(derived(source));

  it("reaches the deliverable's own name and purpose", () => {
    expect(text).toContain("mandate confirmation from wagas");
  });

  it("reaches the draft's recipient, subject and body", () => {
    expect(text).toContain("kofi.mensah@wagas.com");
    expect(text).toContain("part a and part b");
    expect(text).toContain("wish to proceed");
  });

  it("reaches the words of a reply and the names of its attachments", () => {
    expect(text).toContain("liberia module");
    expect(text).toContain("concession renewal notice.pdf");
  });

  it("reaches the author, so correspondence can be found by who sent it", () => {
    expect(text).toContain("kofi mensah");
  });

  it("holds together for a deliverable with neither draft nor replies", () => {
    expect(deliverableSearchText(derived())).toContain("mandate confirmation");
  });

  it("matches on a word from a reply, and rejects one that is nowhere", () => {
    expect(deliverableMatches(derived(source), "Liberia")).toBe(true);
    expect(deliverableMatches(derived(source), "concession renewal")).toBe(true);
    expect(deliverableMatches(derived(source), "escrow")).toBe(false);
  });

  it("treats an empty search as no search at all", () => {
    expect(deliverableMatches(derived(), "   ")).toBe(true);
  });
});
