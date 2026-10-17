import { describe, expect, it } from "vitest";
import { docToParas } from "@/lib/export/rich-doc";
import { buildDocx, gridTableXml } from "@/lib/export/docx";
import { addTaskRows, buildEml, emailHtml, starterDoc, tableNode } from "./handover";

const decode = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));

describe("handover", () => {
  it("starts from a skeleton with ruled tables", () => {
    const tables = starterDoc().content.filter((n) => n.type === "table");
    expect(tables).toHaveLength(3);
    expect(tables[0]!.content![0]!.content!.map((c) => c.type)).toEqual(
      Array(5).fill("tableHeader"),
    );
  });

  it("builds an unsent email with its body and attachments", () => {
    const eml = buildEml(
      {
        to: "team@nexis.africa",
        cc: "",
        subject: "Handover – Bugatti",
        html: "<p>Hi</p>",
        plain: "Hi",
        attachments: [{ name: "memo.pdf", mime: "application/pdf", bytes: new Uint8Array([1, 2]) }],
      },
      "x",
    );
    expect(eml.startsWith("X-Unsent: 1\r\n")).toBe(true);
    expect(eml).toContain("To: team@nexis.africa");
    expect(eml).not.toContain("Cc:");
    // The dash is not ASCII, so the subject is encoded rather than garbled.
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
    expect(eml).toContain('Content-Disposition: attachment; filename="memo.pdf"');
    const html = eml.split("Content-Type: text/html; charset=utf-8\r\n")[1]!;
    expect(decode(html.split("\r\n\r\n")[1]!.split("\r\n--")[0]!)).toBe("<p>Hi</p>");
    expect(eml.trimEnd().endsWith("--=_scripta_mixed_x--")).toBe(true);
  });

  it("gives an email's tables their rules inline, for Outlook", () => {
    const html = emailHtml(
      "<table><tbody><tr><th><p>Task</p></th><td><p>x</p></td></tr></tbody></table>",
    );
    expect(html).toContain("border-collapse:collapse");
    expect(html).toMatch(/<th style="[^"]*border:1px solid[^"]*">Task<\/th>/);
    expect(html).toMatch(/<td style="[^"]*">x<\/td>/);
  });

  it("carries a table into Word as a ruled table with a heading row", () => {
    const paras = docToParas({
      type: "doc",
      content: [tableNode(["Task", "Due"], [["Reply to Ocorian", "18 Sep"]])],
    });
    expect(paras).toHaveLength(1);
    const grid = paras[0]!.grid!;
    expect(grid.rows[0]!.header).toBe(true);
    expect(grid.rows[1]!.cells.map((c) => c.map((r) => r.t).join(""))).toEqual([
      "Reply to Ocorian",
      "18 Sep",
    ]);
    const xml = gridTableXml(grid);
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain('w:val="single"');
    expect(xml).toContain("Reply to Ocorian");
    expect(
      buildDocx({ title: "Handover", clauses: [{ num: "", title: "", segs: [], paras }] }).length,
    ).toBeGreaterThan(0);
  });

  it("fills the note's tasks table rather than adding a second one", () => {
    const doc = addTaskRows(starterDoc(), [["Research brief", "Bugatti", "To do", "17 Sep", ""]]);
    const tables = doc.content.filter((n) => n.type === "table");
    expect(tables).toHaveLength(3);
    // The heading row and the task; the blank starter row is gone.
    expect(tables[0]!.content).toHaveLength(2);
    const again = addTaskRows(doc, [["Reply to Ocorian", "", "To do", "15 Sep", ""]]);
    expect(again.content.filter((n) => n.type === "table")[0]!.content).toHaveLength(3);
    const removed = { ...doc, content: doc.content.filter((n) => n !== tables[0]) };
    expect(addTaskRows(removed, [["X", "", "", "", ""]]).content.at(-1)!.type).toBe("table");
  });
});
