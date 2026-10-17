import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createZip, utf8 } from "@/lib/export/zip";
import {
  emptyOrganisation,
  type Entity,
  type Holding,
  type Organisation,
  type Role,
} from "../model";
import { organogramLayout, structureLayout } from "./build";
import { chartCsv, chartPdf, chartPptx, chartSvg } from "./export";
import { plain } from "./compose";
import {
  guessColumns,
  importSummary,
  parseCsv,
  parseDrawio,
  parsePercent,
  parsePptx,
  parseXlsx,
  proposeDecisions,
  rowsToJob,
} from "./import";
import { layoutLayered, layoutTree, NODE_H } from "./layout";

const role = (
  id: string,
  title: string,
  parentRoleId: string | null,
  extra: Partial<Role> = {},
): Role => ({
  id,
  title,
  functionName: "",
  kind: "role",
  kindLabel: "",
  entityId: null,
  parentRoleId,
  holderPersonId: null,
  acting: false,
  coverRoleId: null,
  coverNote: "",
  position: 0,
  effectiveFrom: null,
  effectiveTo: null,
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
  ...extra,
});

const entity = (
  id: string,
  name: string,
  jurisdiction: string,
  extra: Partial<Entity> = {},
): Entity => ({
  id,
  clientId: "c",
  name,
  shortName: "",
  entityType: "",
  jurisdiction,
  registrationNo: "",
  taxNo: "",
  incorporatedOn: null,
  registeredOffice: "",
  activity: "",
  shareCapital: "",
  status: "active",
  proposedChangeId: null,
  notes: "",
  fieldSources: {},
  lastChangeOn: null,
  lastChangeRef: null,
  updatedAt: "",
  archivedAt: null,
  ...extra,
});

const holding = (
  id: string,
  from: Partial<Holding>,
  to: string,
  percent: number | null,
): Holding => ({
  id,
  ownerEntityId: null,
  ownerPersonId: null,
  ownerName: null,
  subsidiaryEntityId: to,
  percent,
  instrument: "",
  effectiveFrom: null,
  effectiveTo: null,
  proposedChangeId: null,
  removedByChangeId: null,
  lastChangeOn: null,
  lastChangeRef: null,
  ...from,
});

const group = (): Organisation => {
  const org = emptyOrganisation("c", "w");
  org.people = [
    {
      id: "p1",
      clientId: "c",
      fullName: "Dominik Kleemann",
      email: "",
      phone: "",
      location: "Dubai",
      notes: "",
      archivedAt: null,
    },
  ];
  org.roles = [
    role("ceo", "Chief Executive", null, { kind: "leadership", holderPersonId: "p1" }),
    role("cm", "Country Manager", "ceo", { kind: "leadership" }),
    role("corp", "Corporate", "ceo", { kind: "head" }),
    role("fin", "Finance", "corp"),
    role("legal", "Legal", "corp"),
    role("ops", "Operations", "cm"),
  ];
  org.lines = [{ id: "l1", roleId: "ops", toRoleId: "legal", note: "" }];
  org.entities = [
    entity("llc", "Nexis Africa LLC", "UAE"),
    entity("gh", "Nexis Africa (Ghana)", "Ghana"),
    entity("gm", "Goldenmark Ghana", "Ghana"),
    entity("abm", "ABM Ghana", "Ghana"),
  ];
  org.holdings = [
    holding("h1", { ownerPersonId: "p1" }, "llc", 100),
    holding("h2", { ownerPersonId: "p1" }, "gh", 100),
    holding("h3", { ownerEntityId: "gh" }, "gm", 100),
    holding("h4", { ownerEntityId: "gh" }, "abm", 51),
    holding("h5", { ownerName: "Minority partner" }, "abm", 49),
  ];
  return org;
};

describe("reporting layout", () => {
  it("centres a manager over their reports and keeps ranks level", () => {
    const layout = organogramLayout(group(), "reporting", "2026-09-16");
    const at = new Map(layout.nodes.map((n) => [n.id, n]));
    const ceo = at.get("ceo")!;
    const cm = at.get("cm")!;
    const corp = at.get("corp")!;
    expect(cm.y).toBe(corp.y);
    expect(cm.y).toBeGreaterThan(ceo.y + NODE_H);
    const mid = (cm.x + cm.w / 2 + corp.x + corp.w / 2) / 2;
    expect(Math.abs(ceo.x + ceo.w / 2 - mid)).toBeLessThan(1);
    // Boxes never overlap on a row.
    const row = layout.nodes.filter((n) => n.y === at.get("fin")!.y).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++)
      expect(row[i]!.x).toBeGreaterThanOrEqual(row[i - 1]!.x + row[i - 1]!.w);
  });

  it("gives the same positions for the same records in any order", () => {
    const a = organogramLayout(group(), "reporting");
    const shuffled = group();
    shuffled.roles.reverse();
    const b = organogramLayout(shuffled, "reporting");
    const pos = (l: typeof a) => l.nodes.map((n) => `${n.id}@${n.x},${n.y}`).sort();
    expect(pos(b)).toEqual(pos(a));
  });

  it("draws dotted lines without moving anything, and marks vacancies", () => {
    const layout = organogramLayout(group(), "reporting");
    expect(layout.edges.find((e) => e.id === "line-l1")?.style).toBe("dotted");
    expect(layout.nodes.find((n) => n.id === "cm")?.tone).toBe("vacant");
    expect(layout.nodes.find((n) => n.id === "ceo")?.subtitle).toBe("Dominik Kleemann");
  });

  it("survives a reporting loop in the data", () => {
    const layout = layoutTree({
      nodes: [
        { id: "a", kind: "role", title: "A", subtitle: "", tone: "role", parentId: "b" },
        { id: "b", kind: "role", title: "B", subtitle: "", tone: "role", parentId: "a" },
      ],
    });
    expect(layout.nodes).toHaveLength(2);
  });

  it("drops roles not yet in force on the as-at date", () => {
    const org = group();
    org.roles.push(role("new", "Compliance", "corp", { effectiveFrom: "2026-10-01" }));
    expect(organogramLayout(org, "reporting", "2026-09-16").nodes.some((n) => n.id === "new")).toBe(
      false,
    );
    expect(organogramLayout(org, "reporting", "2026-10-02").nodes.some((n) => n.id === "new")).toBe(
      true,
    );
  });
});

describe("ownership layout", () => {
  it("lays out a client with nothing recorded yet, instead of throwing", () => {
    const org = emptyOrganisation("c", "w");
    for (const mode of ["current", "target", "compare"] as const)
      expect(structureLayout(org, mode).nodes).toEqual([]);
  });

  it("ranks holders above what they hold, with outside holders beside the group", () => {
    const layout = structureLayout(group(), "current");
    const at = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(at.get("p:p1")!.y).toBeLessThan(at.get("gh")!.y);
    expect(at.get("gh")!.y).toBeLessThan(at.get("abm")!.y);
    expect(at.get("o:Minority partner")!.kind).toBe("outside");
    expect(layout.edges.find((e) => e.id === "h4")?.label).toBe("51%");
    // The home jurisdiction is the one most of the group sits in.
    expect(at.get("gh")!.tone).toBe("home");
    expect(at.get("llc")!.tone).toBe("foreign");
  });

  it("places an entity held twice below both holders", () => {
    const layout = layoutLayered({
      nodes: ["top", "mid", "low"].map((id) => ({
        id,
        kind: "entity" as const,
        title: id,
        subtitle: "",
        tone: "home" as const,
      })),
      edges: [
        { id: "1", from: "top", to: "mid" },
        { id: "2", from: "mid", to: "low" },
        { id: "3", from: "top", to: "low" },
      ],
    });
    const y = new Map(layout.nodes.map((n) => [n.id, n.y]));
    expect(y.get("low")!).toBeGreaterThan(y.get("mid")!);
  });

  it("meets every card at the middle of an edge, and never runs behind another card", () => {
    // The Volta Ridge shape that first broke the chart: a person holding part of
    // a grandchild company, a minority outsider, and two subsidiaries each with
    // a subsidiary of its own. A line through a card, or two holders on one run,
    // makes the chart say someone owns something they do not.
    const node = (id: string) => ({
      id,
      kind: "entity" as const,
      title: id,
      subtitle: "",
      tone: "home" as const,
    });
    const graph = {
      nodes: ["Ama", "Holdings", "Sahel", "Kwesi", "Ghana", "Trading", "Logistics", "Minerals"].map(
        node,
      ),
      edges: [
        { id: "a", from: "Ama", to: "Holdings" },
        { id: "b", from: "Holdings", to: "Trading" },
        { id: "c", from: "Sahel", to: "Trading" },
        { id: "d", from: "Holdings", to: "Ghana" },
        { id: "e", from: "Ghana", to: "Minerals" },
        { id: "f", from: "Ghana", to: "Logistics" },
        { id: "g", from: "Kwesi", to: "Logistics" },
        { id: "h", from: "Ama", to: "Minerals" },
      ],
    };
    for (const secondHolder of ["side", "joined"] as const) {
      const layout = layoutLayered(graph, { secondHolder });
      const at = new Map(layout.nodes.map((n) => [n.id, n]));
      const segments = layout.edges.flatMap((e) =>
        e.points.slice(1).map((p, i) => ({ edge: e, a: e.points[i]!, b: p })),
      );
      for (const { edge, a, b } of segments)
        for (const n of layout.nodes) {
          if (n.id === edge.from || n.id === edge.to) continue;
          const overlaps =
            Math.min(a.x, b.x) < n.x + n.w &&
            Math.max(a.x, b.x) > n.x &&
            Math.min(a.y, b.y) < n.y + n.h &&
            Math.max(a.y, b.y) > n.y;
          expect(overlaps, `${secondHolder}: ${edge.id} crosses ${n.id}`).toBe(false);
        }
      // A run across may be shared only by one holder's own lines.
      const runs = segments.filter((s) => s.a.y === s.b.y && s.a.x !== s.b.x);
      for (const r of runs)
        for (const q of runs) {
          if (r.edge.from === q.edge.from || r.a.y !== q.a.y) continue;
          const overlap =
            Math.min(Math.max(r.a.x, r.b.x), Math.max(q.a.x, q.b.x)) -
            Math.max(Math.min(r.a.x, r.b.x), Math.min(q.a.x, q.b.x));
          expect(
            overlap,
            `${secondHolder}: ${r.edge.id} runs along ${q.edge.id}`,
          ).toBeLessThanOrEqual(0);
        }
      for (const e of layout.edges) {
        const from = at.get(e.from)!;
        const to = at.get(e.to)!;
        const start = e.points[0]!;
        const end = e.points.at(-1)!;
        expect(start, `${e.id} leaves from the middle of the bottom`).toEqual({
          x: from.x + from.w / 2,
          y: from.y + from.h,
        });
        const middles = [
          { x: to.x + to.w / 2, y: to.y },
          { x: to.x, y: to.y + to.h / 2 },
          { x: to.x + to.w, y: to.y + to.h / 2 },
        ];
        expect(middles, `${e.id} enters at the middle of an edge`).toContainEqual(end);
      }
      if (secondHolder === "side")
        // A holder with one holding, over a company it alone sits above, is a
        // straight line: no bend that the cards do not force.
        for (const id of ["c", "g"]) {
          const e = layout.edges.find((x) => x.id === id)!;
          expect(e.points, `${id} runs straight`).toHaveLength(2);
        }
      else
        // Joined above a card: each shareholder comes down, turns once, and the
        // lines meet over the middle of the card.
        for (const target of ["Trading", "Logistics"]) {
          const card = at.get(target)!;
          const mid = card.x + card.w / 2;
          const lines = layout.edges.filter((x) => x.to === target);
          expect(lines).toHaveLength(2);
          const holderXs = lines.map((e) => at.get(e.from)!).map((h) => h.x + h.w / 2);
          const between =
            (holderXs[0]! - mid) * (holderXs[1]! - mid) < 0 &&
            holderXs.every((x) => Math.abs(x - mid) > 1);
          const top = { x: mid, y: card.y };
          if (between) {
            // Joined above the card: each line turns once and they meet over its middle.
            for (const e of lines) {
              expect(e.points.at(-1), `${e.id} ends at the middle of the top`).toEqual(top);
              expect(e.points.length, `${e.id} turns once`).toBeLessThanOrEqual(4);
            }
          } else {
            // Not between them: one line comes in at the top, the other at the side,
            // never merged into the first.
            const ends = lines.map((e) => e.points.at(-1)!);
            expect(ends.filter((p) => p.x === top.x && p.y === top.y)).toHaveLength(1);
            expect(ends.filter((p) => p.y === card.y + card.h / 2)).toHaveLength(1);
          }
        }
      // Two holders never arrive at the same point unless they were asked to join.
      if (secondHolder === "side") {
        const trading = layout.edges.filter((e) => e.to === "Trading").map((e) => e.points.at(-1));
        expect(new Set(trading.map((p) => `${p!.x},${p!.y}`)).size).toBe(2);
      }
    }
  });

  it("breaks cross-holdings rather than looping", () => {
    const layout = layoutLayered({
      nodes: ["a", "b"].map((id) => ({
        id,
        kind: "entity" as const,
        title: id,
        subtitle: "",
        tone: "home" as const,
      })),
      edges: [
        { id: "1", from: "a", to: "b" },
        { id: "2", from: "b", to: "a" },
      ],
    });
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(2);
  });

  it("shows planned changes in the target and marks them in compare", () => {
    const org = group();
    org.changes = [{ id: "ch", title: "FZCO to 100%", detail: "", status: "planned", position: 0 }];
    org.holdings.push(holding("h6", { ownerEntityId: "gh", proposedChangeId: "ch" }, "abm", 100));
    org.holdings.find((h) => h.id === "h4")!.removedByChangeId = "ch";
    org.holdings.find((h) => h.id === "h5")!.removedByChangeId = "ch";
    const target = structureLayout(org, "target");
    expect(target.edges.map((e) => e.id)).toContain("h6");
    expect(target.edges.map((e) => e.id)).not.toContain("h4");
    const compare = structureLayout(org, "compare");
    expect(compare.edges.find((e) => e.id === "h6")?.style).toBe("added");
    expect(compare.edges.find((e) => e.id === "h4")?.style).toBe("removed");
  });
});

describe("reading charts", () => {
  it("reads a reporting sheet, matching reports-to by role or name", () => {
    const rows = parseCsv(
      'Title,Name,Reports to\r\nChief Executive,Dominik Kleemann,\r\nCountry Manager,"Amankwah, Kojo",Dominik Kleemann\r\nFinance,Alice Tetteh,Country Manager\r\nLogistics,,Nobody here\r\n',
    );
    const job = rowsToJob(rows, "reporting", guessColumns(rows[0]!), "org.csv", "csv");
    expect(job.nodes.map((n) => n.title)).toEqual([
      "Chief Executive",
      "Country Manager",
      "Finance",
      "Logistics",
    ]);
    expect(job.nodes[1]!.subtitle).toBe("Amankwah, Kojo");
    expect(job.edges).toHaveLength(2);
    expect(job.unresolved.some((u) => u.includes("Nobody here"))).toBe(true);
  });

  it("reads a shareholding sheet with percentages", () => {
    const rows = parseCsv(
      "Shareholder,Entity,Percent\nNexis Africa LLC,Nexis Africa MEA FZCO,51%\nMinority partner,Nexis Africa MEA FZCO,49\n",
    );
    const map = guessColumns(rows[0]!);
    expect(map.parent).toBe(0);
    expect(map.child).toBe(1);
    const job = rowsToJob(rows, "ownership", map, "s.csv", "csv");
    expect(job.edges.map((e) => e.percent)).toEqual([51, 49]);
    expect(parsePercent("12.5 %")).toBe(12.5);
    expect(parsePercent("n/a")).toBeNull();
  });

  it("reads the first sheet of a workbook, shared and inline strings", async () => {
    const files = {
      "xl/workbook.xml":
        '<workbook><sheets><sheet name="Org" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        "<sst><si><t>Title</t></si><si><t>Name</t></si><si><t>Finance &amp; Tax</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>Note</t></is></c></row></sheetData></worksheet>',
    };
    const bytes = createZip(
      Object.entries(files).map(([path, body]) => ({ path, data: utf8(body) })),
    );
    const rows = await parseXlsx(bytes);
    expect(rows).toEqual([
      ["Title", "Name"],
      ["Finance & Tax", "", "Note"],
    ]);
  });

  it("reads a compressed draw.io diagram and puts the upper box on top", async () => {
    const model =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="a" value="Nexis Africa (Ghana)&lt;br&gt;Accra" vertex="1" parent="1"><mxGeometry x="100" y="200" width="120" height="60" as="geometry"/></mxCell>' +
      '<mxCell id="b" value="Goldenmark Ghana" vertex="1" parent="1"><mxGeometry x="100" y="400" width="120" height="60" as="geometry"/></mxCell>' +
      '<mxCell id="e" edge="1" parent="1" source="b" target="a"><mxGeometry relative="1" as="geometry"/></mxCell>' +
      '<mxCell id="lbl" value="100%" vertex="1" connectable="0" parent="e"><mxGeometry as="geometry"/></mxCell>' +
      "</root></mxGraphModel>";
    const deflated = new Uint8Array(
      await new Response(
        new Blob([utf8(encodeURIComponent(model)) as BlobPart])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );
    let bin = "";
    for (const b of deflated) bin += String.fromCharCode(b);
    const file = `<mxfile><diagram id="d" name="Page-1">${btoa(bin)}</diagram></mxfile>`;
    const job = await parseDrawio(file, "ownership", "g.drawio");
    expect(job.nodes.map((n) => n.title)).toEqual(["Nexis Africa (Ghana)", "Goldenmark Ghana"]);
    expect(job.nodes[0]!.subtitle).toBe("Accra");
    expect(job.edges).toEqual([
      { from: "a", to: "b", label: "100%", percent: 100, inferred: false },
    ]);
  });

  it("matches candidates to existing records by name", () => {
    const rows = parseCsv(
      "Holder,Entity,%\nDominik Kleemann,Nexis Africa LLC,100\nNew Partner,New Holdco Ltd,60\n",
    );
    const job = rowsToJob(
      rows,
      "ownership",
      { ...guessColumns(rows[0]!), parent: 0, child: 1, percent: 2 },
      "x.csv",
      "csv",
    );
    const org = group();
    const decisions = proposeDecisions(job, {
      roles: [],
      entities: org.entities.map((e) => ({ id: e.id, name: e.name, shortName: e.shortName })),
      people: org.people.map((p) => ({ id: p.id, fullName: p.fullName })),
    });
    const key = (title: string) => job.nodes.find((n) => n.title === title)!.key;
    expect(decisions[key("Dominik Kleemann")]).toEqual({ kind: "match", id: "p1", as: "person" });
    expect(decisions[key("Nexis Africa LLC")]).toEqual({ kind: "match", id: "llc", as: "entity" });
    expect(decisions[key("New Holdco Ltd")]).toEqual({ kind: "new", as: "entity" });
    expect(decisions[key("New Partner")]).toEqual({ kind: "new", as: "outside" });
    expect(importSummary(job, decisions).matched).toBe(2);
  });
});

describe("chart files", () => {
  const meta = { title: "Organogram — Nexis Africa", footer: "As at 16 September 2026 · Scripta" };

  it("writes a vector PDF with a cross-reference table", () => {
    const bytes = chartPdf(plain(organogramLayout(group(), "reporting")), meta, "A3");
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("xref");
    expect(text).toContain("/MediaBox [0 0 1190.55 841.89]");
    expect(text).toContain("(Chief Executive) Tj");
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    expect(text).toContain("As at 16 September 2026");
  });

  it("writes a PowerPoint deck of shapes and glued connectors that reads back", async () => {
    const layout = organogramLayout(group(), "reporting");
    const bytes = chartPptx(plain(layout), meta, "A4");
    const zip = await JSZip.loadAsync(bytes);
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("<p:cxnSp>");
    expect(slide).toContain("<a:custGeom>");
    expect(slide).toContain("<a:stCxn");
    expect(zip.file("ppt/theme/theme1.xml")).toBeTruthy();
    const job = await parsePptx(bytes, "reporting", "deck.pptx");
    expect(job.nodes.map((n) => n.title).sort()).toEqual(layout.nodes.map((n) => n.title).sort());
    const title = (key: string) => job.nodes.find((n) => n.key === key)!.title;
    const pairs = job.edges
      .filter((e) => !e.inferred)
      .map((e) => `${title(e.from)}>${title(e.to)}`);
    expect(pairs).toContain("Chief Executive>Country Manager");
    expect(pairs).toContain("Corporate>Finance");
  });

  it("writes SVG and CSV from the same layout", () => {
    const layout = structureLayout(group(), "current");
    expect(chartSvg(plain(layout), meta)).toContain("Goldenmark Ghana");
    const csv = chartCsv(plain(layout), meta);
    expect(csv).toContain("Minority partner,ABM Ghana,49%,solid");
  });
});
