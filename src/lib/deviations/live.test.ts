/**
 * The real thing, when it happens to be on this machine.
 *
 * The fixtures are a privileged redline and a live tender appendix. They are
 * deliberately not in the repository, so this file skips unless both are
 * present at the paths below. `deviations.test.ts` carries the coverage that
 * runs everywhere.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { checkSchedule, readRedline } from "./index";

const REDLINE = "/Users/kwame/Downloads/18.09.26 - Master FWA [CBRE Redline]2.docx";
const present = existsSync(REDLINE);

describe.skipIf(!present)("the CBRE redline", () => {
  it("passes all three checks and splits the definitions apart", async () => {
    const read = await readRedline(readFileSync(REDLINE));
    for (const check of checkSchedule(read))
      console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
    console.log(`rows: ${read.rows.length}`);

    expect(checkSchedule(read).filter((c) => !c.passed)).toEqual([]);

    // Article 1.1 holds ten definitions, six of them amended. They must not
    // arrive as one cell.
    const definitions = read.rows.filter((row) => row.original.trimStart().startsWith('"'));
    console.log("definition rows:", definitions.length);
    console.log(definitions.map((d) => `  ${d.reference}  ${d.original.slice(0, 52)}`).join("\n"));
    expect(definitions.length).toBeGreaterThanOrEqual(6);
    // Each is cited by its term, and none reports a clause number the document
    // does not contain ("Article X" is a numbering artefact of the list).
    for (const row of definitions) expect(row.reference).toMatch(/definition of/);
    expect(definitions.every((r) => !/Article [IVX]/.test(r.reference))).toBe(true);
  });
});
