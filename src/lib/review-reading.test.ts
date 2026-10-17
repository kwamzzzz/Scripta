import { describe, expect, it } from "vitest";
import type { ClauseDoc } from "@/wireframe/clause-doc";
import { reviewBody, reviewOriginal, type ReadingSeg } from "./review-reading";

const AT = "2026-09-16T09:12:00.000Z";
const ME = "6df711b6-27b0-4aaf-8129-ef39700de7bb";

/** "within thirty forty-five days", thirty proposed for deletion. */
const marked: ClauseDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Delivery within " },
        {
          type: "text",
          text: "thirty",
          marks: [{ type: "deletion", attrs: { changeId: "c1", setId: "s1", authorId: ME, at: AT } }],
        },
        {
          type: "text",
          text: "forty-five",
          marks: [{ type: "insertion", attrs: { changeId: "c2", setId: "s1", authorId: ME, at: AT } }],
        },
        { type: "text", text: " days." },
      ],
    },
  ],
};

/* The frozen shadow: what the segments still said before Phase 5 stopped
   writing them. Deliberately different wording, so a test cannot pass by
   reading the wrong source and getting the right answer by luck. */
const staleSegs: ReadingSeg[] = [{ t: "Delivery within ninety days.", k: "n" }];

describe("the wording the review is shown", () => {
  it("judges the clause as it would read if the proposals were accepted", () => {
    expect(reviewBody(marked, staleSegs)).toBe("Delivery within forty-five days.");
  });

  it("shows the wording those proposals were made against as the original", () => {
    expect(reviewOriginal(marked, staleSegs)).toBe("Delivery within thirty days.");
  });

  it("ignores the segments entirely when there is a document", () => {
    expect(reviewBody(marked, staleSegs)).not.toContain("ninety");
    expect(reviewOriginal(marked, staleSegs)).not.toContain("ninety");
  });

  it("falls back to the segments for a clause the migration never converted", () => {
    const segs: ReadingSeg[] = [
      { t: "Delivery within ", k: "n" },
      { t: "thirty", k: "d" },
      { t: "forty-five", k: "i" },
      { t: " days.", k: "n" },
    ];
    expect(reviewBody(null, segs)).toBe("Delivery within forty-five days.");
    expect(reviewOriginal(null, segs)).toBe("Delivery within thirty days.");
  });

  it("reads a clean clause the same either way", () => {
    const clean: ClauseDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Delivery within thirty days." }] }],
    };
    expect(reviewBody(clean, [])).toBe(reviewOriginal(clean, []));
  });
});
