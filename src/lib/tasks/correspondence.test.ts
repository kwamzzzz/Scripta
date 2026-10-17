import { describe, expect, it } from "vitest";
import { correspondenceSearchText, searchableText } from "@/lib/correspondence";
import { taskSearchText, type Task } from "./model";

const task = (patch: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Send the fee proposal",
  detail: "",
  status: "Open",
  priority: "normal",
  dueDate: null,
  plannedOn: null,
  matterId: null,
  matterName: "",
  clientId: null,
  clientName: "",
  flowId: null,
  flowName: "",
  assigneeId: null,
  origin: "manual",
  originId: null,
  deliverableId: null,
  tool: null,
  checklist: [],
  tags: [],
  emailDraft: null,
  threads: [],
  attachments: [],
  output: null,
  completedAt: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
  ...patch,
});

const reply = (text: string, author = "Kofi Mensah, WAGAS") => ({
  id: "r1",
  author,
  text,
  searchText: searchableText(text),
  attachments: [],
  createdAt: "2026-09-14T10:00:00.000Z",
});

describe("a task's correspondence is searchable from the task", () => {
  it("reaches the wording of a reply", () => {
    const t = task({ threads: [reply("Confirmed — we proceed with Part A only.")] });
    expect(taskSearchText(t)).toContain("part a only");
  });

  it("reaches who replied, which is how correspondence is remembered", () => {
    const t = task({ threads: [reply("Noted.")] });
    expect(taskSearchText(t)).toContain("wagas");
  });

  it("reaches an attachment by name", () => {
    const t = task({
      threads: [
        {
          ...reply("See attached."),
          attachments: [
            {
              id: "a1",
              name: "Fee Proposal v2.docx",
              fileRef: "idb:a1",
              bytes: 1024,
              mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ],
        },
      ],
    });
    expect(taskSearchText(t)).toContain("fee proposal v2.docx");
  });

  it("reaches the draft that has not been sent", () => {
    const t = task({
      emailDraft: {
        to: "kofi.mensah@wagas.com",
        subject: "Fee proposal — gold trade advisory",
        body: "As discussed, our fees for the mandate are set out below.",
        updatedAt: "2026-09-14T09:30:00.000Z",
      },
    });
    const folded = taskSearchText(t);
    expect(folded).toContain("kofi.mensah@wagas.com");
    expect(folded).toContain("gold trade advisory");
  });

  it("says nothing when there is no correspondence", () => {
    expect(correspondenceSearchText({ threads: [], emailDraft: null })).toBe("");
  });
});
