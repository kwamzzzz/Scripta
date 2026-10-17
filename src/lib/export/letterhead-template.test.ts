import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { artOnly, fitPageSizedDrawings, readDocxTemplate, relIdsIn } from "./letterhead-template";

/**
 * A Word template shaped like the firm's: US Letter, page one drawn in the
 * body — a full-page picture and a logo — and closed by a page break, page
 * one marked as its own, and a default header carrying the continuation mark.
 */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const picture = (rel: string, cx: number, cy: number, anchor = true) =>
  anchor
    ? `<w:r><w:drawing><wp:anchor behindDoc="1"><wp:positionH relativeFrom="margin"><wp:posOffset>-914400</wp:posOffset></wp:positionH>` +
      `<wp:positionV relativeFrom="margin"><wp:posOffset>-914400</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<a:graphic><a:blip r:embed="${rel}"/><a:ext cx="${cx}" cy="${cy}"/></a:graphic></wp:anchor></w:drawing></w:r>`
    : `<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:blip r:embed="${rel}"/></a:graphic></wp:inline></w:drawing></w:r>`;

export async function templateDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${W} ${R} ${WP} ${A} ${MC} mc:Ignorable="w14 wp14"><w:body>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${picture("rId9", 7772400, 10058400)}</w:p>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>${picture("rId10", 3429000, 3429000)}</w:p>` +
      `<w:p><w:r><w:t>Not on page one</w:t></w:r></w:p>`.replace(
        "<w:r>",
        `<w:r><w:br w:type="page"/></w:r><w:r>`,
      ) +
      `<w:p><w:r><w:t>Page two words</w:t></w:r></w:p>` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rId11"/><w:pgSz w:w="12240" w:h="15840"/>` +
      `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/><w:titlePg/></w:sectPr>` +
      `</w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId9" Type="${REL}/image" Target="media/image1.jpg"/>` +
      `<Relationship Id="rId10" Type="${REL}/image" Target="media/image2.png"/>` +
      `<Relationship Id="rId11" Type="${REL}/header" Target="header1.xml"/></Relationships>`,
  );
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0"?><w:hdr ${W} ${R} ${WP} ${A}><w:p>${picture("rId1", 1685364, 304800, false)}</w:p></w:hdr>`,
  );
  zip.file(
    "word/_rels/header1.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/image" Target="media/image3.png"/></Relationships>`,
  );
  zip.file("word/media/image1.jpg", new Uint8Array([0xff, 0xd8, 1, 2, 3]));
  zip.file("word/media/image2.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4]));
  zip.file("word/media/image3.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5]));
  return zip.generateAsync({ type: "uint8array" });
}

describe("readDocxTemplate", () => {
  it("reads the page, the page-one body up to its break, and the parts each kind of page uses", async () => {
    const t = await readDocxTemplate(await templateDocx());
    expect(t.page).toMatchObject({ width: 12240, height: 15840, top: 1440, header: 708 });
    expect(t.titlePage).toBe(true);
    // Page one is the body up to the page break; the break itself and what
    // follows it are not part of the paper.
    expect(t.firstPageBody).toContain('r:embed="rId9"');
    expect(t.firstPageBody).toContain('r:embed="rId10"');
    expect(t.firstPageBody).not.toContain('w:type="page"');
    expect(t.firstPageBody).not.toContain("Page two words");
    // Words the template carries on page one are its sample text, not paper.
    expect(t.firstPageBody).not.toContain("Not on page one");
    expect(t.firstPageMedia).toEqual({ rId9: "media/image1.jpg", rId10: "media/image2.png" });
    expect(t.first.header).toBeUndefined();
    expect(t.default.header?.media).toEqual({ rId1: "media/image3.png" });
    expect(t.media.map((m) => [m.target, m.mime])).toEqual([
      ["media/image1.jpg", "image/jpeg"],
      ["media/image2.png", "image/png"],
      ["media/image3.png", "image/png"],
    ]);
    expect(t.namespaces["wp"]).toContain("wordprocessingDrawing");
    expect(t.ignorable).toBe("w14 wp14");
  });

  it("refuses a file that is not a Word document", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "no");
    await expect(readDocxTemplate(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      /not a Word document/,
    );
  });
});

describe("relIdsIn", () => {
  it("finds every relationship a piece of markup refers to, once", () => {
    expect(
      relIdsIn('<a r:embed="rId9"/><b r:id="rId9"/><c o:relid="rId3"/><d r:link="rId4"/>'),
    ).toEqual(["rId9", "rId3", "rId4"]);
  });
});

describe("fitPageSizedDrawings", () => {
  const letter = { width: 12240, height: 15840 };
  const a4 = { width: 11910, height: 16845 };

  it("stretches a picture drawn to fill the template's page to fill the new one", () => {
    const xml = `<wp:extent cx="7772400" cy="10058400"/><a:ext cx="7772400" cy="10058400"/>`;
    const out = fitPageSizedDrawings(xml, letter, a4);
    expect(out).toBe(
      `<wp:extent cx="${11910 * 635}" cy="${16845 * 635}"/><a:ext cx="${11910 * 635}" cy="${16845 * 635}"/>`,
    );
  });

  it("leaves a logo alone", () => {
    const xml = `<wp:extent cx="3429000" cy="3429000"/>`;
    expect(fitPageSizedDrawings(xml, letter, a4)).toBe(xml);
  });
});

describe("artOnly", () => {
  const art = (rel: string) =>
    `<w:r><w:drawing><wp:anchor><a:blip r:embed="${rel}"/></wp:anchor></w:drawing></w:r>`;

  it("keeps the template's pictures and drops the sample text around them", () => {
    // The contract template's page one still names "SVG & Co as Seller"; the
    // letterhead carries a whole sample letter. Neither is paper.
    const body =
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${art("rId9")}<w:r><w:t>Caption</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>(1) SVG &amp; Co</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${art("rId10")}</w:p>` +
      `<w:p><w:r><w:t>DESIGN AGREEMENT</w:t></w:r></w:p>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table words</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
    const kept = artOnly(body);
    expect(kept).toContain('r:embed="rId9"');
    expect(kept).toContain('r:embed="rId10"');
    expect(kept).toContain('<w:jc w:val="center"/>');
    for (const words of ["Caption", "SVG", "DESIGN AGREEMENT", "Table words"])
      expect(kept).not.toContain(words);
    // The emptied paragraph between the pictures stays, so the second picture
    // is still placed from where its paragraph falls; nothing after the last one does.
    expect(kept.match(/<w:p>/g)).toHaveLength(3);
    expect(kept).not.toContain("<w:tbl");
  });

  it("keeps a text box drawn inside a picture, which is part of the design", () => {
    const box = `<w:r><w:drawing><wps:txbx><w:txbxContent><w:p><w:r><w:t>One Central, DWTC</w:t></w:r></w:p></w:txbxContent></wps:txbx></w:drawing></w:r>`;
    expect(artOnly(`<w:p>${box}<w:r><w:t>Dear Mr. Anderson</w:t></w:r></w:p>`)).toBe(
      `<w:p>${box}</w:p>`,
    );
  });

  it("leaves nothing of a page one that has words and no pictures", () => {
    expect(artOnly(`<w:p><w:r><w:t>20/04/2026</w:t></w:r></w:p><w:p/>`)).toBe("");
  });

  it("drops a section break, which would point at parts this document does not carry", () => {
    const kept = artOnly(
      `<w:p><w:pPr><w:sectPr><w:headerReference r:id="rId7"/></w:sectPr></w:pPr>${art("rId9")}</w:p>`,
    );
    expect(kept).not.toContain("sectPr");
    expect(kept).toContain('r:embed="rId9"');
  });
});
