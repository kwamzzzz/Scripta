/**
 * The structured course template: a whole course skeleton in one step.
 *
 * Start here (about the course, the team and how to use it), a number of
 * topic modules that each run listen, read, read, watch and review, and a
 * final revision and test module. Every item is already named, placed and
 * bound to its outline line, and holds author notes saying what goes where.
 * Notes are never shown to a learner, so a half-filled course reads cleanly;
 * the author replaces them and drops the audio and video in.
 */
import { supabase } from "@/integrations/supabase/client";
import { textToBlocks } from "./blocks";

const db = supabase as unknown as { from: (t: string) => any };

type TemplateItem = { title: string; line: string; text: string };
type TemplateModule = { title: string; items: TemplateItem[] };

const PASTE_HELP =
  "Prefixes when pasting: ## heading, > a clause quoted from the instrument, ? a question to think about, Authority: citation | what it says, ! a note on what has changed since the source was written.";

export function structuredCourse(topics: number): TemplateModule[] {
  const topic = (n: number): TemplateModule => ({
    title: `Module ${n}: Topic`,
    items: [
      {
        title: "Listen first",
        line: "Listen to the audio lesson and note the key points.",
        text: [
          "Note: Drop this module's audio lesson here with Add audio, video, image or PDF, then caption it with what to listen for. A NotebookLM audio overview made from the module text works well.",
        ].join("\n\n"),
      },
      {
        title: "Reading 1",
        line: "Explain the first key idea of this module.",
        text: [
          "Note: Rename this item after its topic and edit the outline line above to match. Then use Paste text for the reading.",
          `Note: ${PASTE_HELP}`,
        ].join("\n\n"),
      },
      {
        title: "Reading 2",
        line: "Explain the second key idea of this module.",
        text: [
          "Note: Rename this item after its topic and edit the outline line to match. Add more readings with Write the item on a new outline line.",
          `Note: ${PASTE_HELP}`,
        ].join("\n\n"),
      },
      {
        title: "Watch",
        line: "See this module's key ideas in a video or diagram.",
        text: "Note: Drop a video, an infographic or a slide deck here and caption it. Delete this item if the module has none.",
      },
      {
        title: "Review before you move on",
        line: "Confirm you can recall, apply and explain this module's key points before moving on.",
        text: [
          "Do this before you move on. It covers the same ground as the final test, so nothing there should come as a surprise. If a card or a question catches you out, go back over that part of the module now, while it is fresh.",
          "## Recall",
          "Say the answer to yourself before you turn each card over.",
          "Note: Paste five or six flashcards, one per line, in the form: front :: back",
          "## Practice",
          "Scenario questions on this module. Nothing you choose is recorded.",
          "Note: Paste three or four questions in this form (a blank line between them):\nQ: the question\nA) option\nB) option\nC) option\nD) option\nAnswer: B\nWhy: one or two sentences",
          "## Can you now...",
          "Answer each in two or three sentences, out loud or on paper. These are the outcomes the module set out at the start.",
          "? Without looking back: explain the first key idea of this module.",
          "? Without looking back: explain the second key idea of this module.",
          "Note: Rewrite the two questions above to match this module's outline lines.",
        ].join("\n\n"),
      },
    ],
  });

  return [
    {
      title: "Start Here",
      items: [
        {
          title: "About this course",
          line: "Know what this course covers, who made it, how to use it and how current its source is.",
          text: [
            "Note: Replace every note in this course with your content. Learners never see notes like this one.",
            "## Welcome",
            "Note: Two or three sentences: what the course covers, who it is for, and what a learner will be able to do at the end.",
            "Note: If the source material is dated, add a Check the current position block here saying how current it is and what to check.",
            "## How to use this course",
            "Each module opens with an audio lesson. Listen first, then work through the items in order. Finish every module with its review before moving on. The final test in the last module shows you where your gaps are.",
            "Note: Add the course team (a course manager, tutors, authors, presenters) from the course home with + Add team member, each with a photo and their institution's logo. Only the people you add are shown.",
          ].join("\n\n"),
        },
      ],
    },
    ...Array.from({ length: topics }, (_, i) => topic(i + 1)),
    {
      title: "Final Revision and Test",
      items: [
        {
          title: "Revision slides",
          line: "Revise the whole course with a slide deck or summary.",
          text: "Note: Drop a revision deck (PDF) here and caption it, or paste a one-page summary. A NotebookLM slide deck made from the whole course works well.",
        },
        {
          title: "Final test",
          line: "Find your gaps with a final test across every module.",
          text: [
            "New questions on every module, testing the same ground as the module reviews from a different angle. Note every question you get wrong and go back to that module before you retake it. Nothing you choose is recorded.",
            "Note: Paste two or three questions per module, each under a ## heading naming the module, in the same Q / A) to D) / Answer / Why form as the reviews.",
          ].join("\n\n"),
        },
      ],
    },
  ];
}

/** Write the template into an existing, empty course. */
export async function applyStructuredCourse(courseId: string, topics: number): Promise<void> {
  const modules = structuredCourse(topics);
  for (let m = 0; m < modules.length; m++) {
    const mod = modules[m]!;
    const { data: row, error } = await db
      .from("learning_modules")
      .insert({ course_id: courseId, title: mod.title, position: m })
      .select()
      .single();
    if (error) throw error;
    const outline: { id: string; text: string; item_id: string }[] = [];
    for (let i = 0; i < mod.items.length; i++) {
      const it = mod.items[i]!;
      const lineId = `l_${Math.random().toString(36).slice(2, 10)}`;
      const { data: item, error: e2 } = await db
        .from("learning_items")
        .insert({
          module_id: row.id,
          kind: "item",
          title: it.title,
          position: i,
          outline_line_id: lineId,
          payload: { blocks: textToBlocks(it.text) },
        })
        .select()
        .single();
      if (e2) throw e2;
      outline.push({ id: lineId, text: it.line, item_id: item.id });
    }
    const { error: e3 } = await db.from("learning_modules").update({ outline }).eq("id", row.id);
    if (e3) throw e3;
  }
}
