import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { textToBlocks } from "./blocks";
import { structuredCourse } from "./template";

describe("structuredCourse", () => {
  const course = structuredCourse(4);

  it("lays out Start here, the topic modules and the final module", () => {
    expect(course.map((m) => m.title)).toEqual([
      "Start Here",
      "Module 1: Topic",
      "Module 2: Topic",
      "Module 3: Topic",
      "Module 4: Topic",
      "Final Revision and Test",
    ]);
    expect(course[1]!.items.map((i) => i.title)).toEqual([
      "Listen first",
      "Reading 1",
      "Reading 2",
      "Watch",
      "Review before you move on",
    ]);
  });

  it("gives every item an outline line", () => {
    for (const m of course) for (const i of m.items) expect(i.line.length).toBeGreaterThan(10);
  });

  it("keeps format examples inside notes rather than turning them into content", () => {
    const review = textToBlocks(course[1]!.items[4]!.text);
    expect(review.some((b) => b.type === "flashcards" || b.type === "quiz")).toBe(false);
    expect(review.filter((b) => b.type === "note").length).toBe(3);
  });

  it("adds no empty team cards; the team is added from the course home", () => {
    const about = textToBlocks(course[0]!.items[0]!.text);
    expect(about.some((b) => b.type === "credit")).toBe(false);
  });
});
