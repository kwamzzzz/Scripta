/**
 * Opening a file once. The stage and the filmstrip both draw from the same
 * parsed document, so a hundred-page bundle is read once however it is being
 * looked at, and closing the viewer lets it go.
 */
import { useEffect, useState } from "react";
import { loadFileBytes } from "@/lib/files";
import { kindOf } from "./kinds";
import { openPdf, type PdfDoc } from "./pdf";
import { openDeck, type Deck } from "./slides";
import { readCsv, readWorkbook } from "./sheet";
import type { DocKind, SheetGrid } from "./model";

export type Opened =
  | { kind: "pdf"; doc: PdfDoc; count: number }
  | { kind: "slides"; deck: Deck; count: number }
  | { kind: "sheet"; sheets: SheetGrid[]; count: number }
  | { kind: "word" | "image" | "text" | "unknown"; count: number };

export type Loaded = {
  status: "loading" | "ready" | "error";
  bytes: ArrayBuffer | null;
  kind: DocKind;
  opened: Opened | null;
  error: string | null;
};

const bytesCache = new Map<string, Promise<ArrayBuffer>>();

/** The file's bytes, kept for this tab so reopening a document is instant. */
export function fetchBytes(fileRef: string): Promise<ArrayBuffer> {
  const held = bytesCache.get(fileRef);
  if (held) return held;
  const fetching = loadFileBytes(fileRef).catch((cause) => {
    bytesCache.delete(fileRef);
    throw cause;
  });
  bytesCache.set(fileRef, fetching);
  return fetching;
}

const trouble: Record<DocKind, string> = {
  pdf: "This PDF could not be opened.",
  word: "This document could not be opened.",
  slides: "This presentation could not be opened.",
  sheet: "This workbook could not be opened.",
  image: "This picture could not be shown.",
  text: "This file could not be read.",
  unknown: "This file could not be opened here.",
};

async function open(bytes: ArrayBuffer, kind: DocKind, name: string): Promise<Opened> {
  if (kind === "pdf") {
    const doc = await openPdf(bytes);
    return { kind, doc, count: doc.count };
  }
  if (kind === "slides") {
    const deck = await openDeck(bytes);
    return { kind, deck, count: deck.count };
  }
  if (kind === "sheet") {
    const sheets = /\.csv$/i.test(name)
      ? [readCsv(new TextDecoder().decode(bytes))]
      : (await readWorkbook(bytes)).sheets;
    return { kind, sheets, count: sheets.length };
  }
  return { kind, count: 1 };
}

/** Load a file and parse it, ready to draw. */
export function useDocument(fileRef: string | null, name: string, open_ = true): Loaded {
  const [state, setState] = useState<Loaded>({
    status: "loading",
    bytes: null,
    kind: "unknown",
    opened: null,
    error: null,
  });

  useEffect(() => {
    if (!fileRef || !open_) return;
    let live = true;
    let held: Opened | null = null;
    setState({ status: "loading", bytes: null, kind: "unknown", opened: null, error: null });
    fetchBytes(fileRef)
      .then(async (bytes) => {
        const kind = kindOf(bytes, name || fileRef);
        try {
          const opened = await open(bytes, kind, name || fileRef);
          held = opened;
          if (!live) return;
          setState({ status: "ready", bytes, kind, opened, error: null });
        } catch {
          if (!live) return;
          // The file arrived; only the drawing failed, so downloading it still works.
          setState({ status: "error", bytes, kind, opened: null, error: trouble[kind] });
        }
      })
      .catch(() => {
        if (live)
          setState({
            status: "error",
            bytes: null,
            kind: "unknown",
            opened: null,
            error: "This file could not be fetched.",
          });
      });
    return () => {
      live = false;
      if (held?.kind === "pdf") held.doc.close();
    };
  }, [fileRef, name, open_]);

  return state;
}
