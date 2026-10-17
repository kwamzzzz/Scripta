/**
 * Builds both standalone formats from the real redline, when it is on this
 * machine, and leaves them in tmp/ for a human to open. Skips otherwise.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readRedline } from "./index";
import { describeAll } from "./justify";
import { buildDeviationsXlsx } from "./export-xlsx";
import { buildDeviationsDocx } from "./export-docx";

const REDLINE = "/Users/kwame/Downloads/18.09.26 - Master FWA [CBRE Redline]2.docx";
// tmp/ is gitignored; created here so the test does not depend on it existing.
const OUT = "/Users/kwame/praxis/tmp/deviations";

describe.skipIf(!existsSync(REDLINE))("standalone exports", () => {
  it("writes a workbook and a Word table with no client template", async () => {
    mkdirSync(OUT, { recursive: true });
    const read = await readRedline(readFileSync(REDLINE));
    const justifications = describeAll(read.rows);
    const shared = {
      rows: read.rows,
      justifications,
      bidder: "CBRE Rowad Al-Riyadh Real Estate Valuation Company",
      responseDate: "22 September 2026",
    };

    const xlsx = buildDeviationsXlsx(shared);
    writeFileSync(`${OUT}/Schedule of Deviations.xlsx`, xlsx);
    const docx = buildDeviationsDocx({ ...shared, agreement: "Master Framework Agreement" });
    writeFileSync(`${OUT}/Schedule of Deviations.docx`, docx);

    console.log(`rows: ${read.rows.length}  xlsx: ${xlsx.length}B  docx: ${docx.length}B`);
    expect(xlsx.length).toBeGreaterThan(5_000);
    expect(docx.length).toBeGreaterThan(5_000);
  });
});
