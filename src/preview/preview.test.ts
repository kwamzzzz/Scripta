import { describe, expect, it } from "vitest";
import { cellAddress, columnName, excelDate, readCsv } from "./sheet";
import { kindFromName, kindOf } from "./kinds";

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("column names", () => {
  it("counts in the alphabet the way a spreadsheet does", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
  });

  it("reads a cell reference back", () => {
    expect(cellAddress("A1")).toEqual({ col: 0, row: 0 });
    expect(cellAddress("BC12")).toEqual({ col: 54, row: 11 });
  });
});

describe("dates", () => {
  it("turns a serial into the day Excel means", () => {
    expect(excelDate(44927).toISOString().slice(0, 10)).toBe("2023-01-01");
    expect(excelDate(46000).toISOString().slice(0, 10)).toBe("2025-12-09");
    // Excel counts a 29th of February 1900 that never happened, so anything
    // before the 1st of March 1900 is a day out. No spreadsheet a firm opens
    // carries dates from then, and the alternative is a special case for a bug
    // in a program from 1987.
  });
});

describe("csv", () => {
  it("keeps commas and quotes inside a field", () => {
    const grid = readCsv('Name,Amount\n"Bugatti, Rimac",1200\n"He said ""no""",3\n');
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[1]!.cells[0]!.value).toBe("Bugatti, Rimac");
    expect(grid.rows[2]!.cells[0]!.value).toBe('He said "no"');
    expect(grid.columns).toBe(2);
  });

  it("marks the numbers so they can sit to the right", () => {
    const grid = readCsv("Fee\n1200\nlater\n");
    expect(grid.rows[1]!.cells[0]!.numeric).toBe(true);
    expect(grid.rows[2]!.cells[0]!.numeric).toBe(false);
  });
});

describe("what a file is", () => {
  it("knows a PDF by its first bytes", () => {
    expect(kindOf(bytesOf("%PDF-1.7 rest"), "no-extension")).toBe("pdf");
  });

  it("tells the Office formats apart by the parts they carry", () => {
    expect(kindOf(bytesOf("PK…word/document.xml…"), "x")).toBe("word");
    expect(kindOf(bytesOf("PK…ppt/presentation.xml…"), "x")).toBe("slides");
    expect(kindOf(bytesOf("PK…xl/workbook.xml…"), "x")).toBe("sheet");
  });

  it("falls back to the name when the bytes say nothing", () => {
    expect(kindOf(bytesOf("plain words"), "deck.pptx")).toBe("slides");
    expect(kindFromName("ver_123-Bugatti_proposal.PPTX")).toBe("slides");
    expect(kindFromName("workbook.csv")).toBe("sheet");
    expect(kindFromName("scan.jpeg")).toBe("image");
    expect(kindFromName("mystery")).toBe("unknown");
  });
});
