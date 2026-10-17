/**
 * Word documents. docx-preview lays the file out as the pages Word would
 * print, which is what a lawyer checking a draft needs to see; when a file is
 * too odd for it, the text of the document is read straight out of the file so
 * that something readable is still on screen.
 */
export type WordRender = { pages: number; fallback: boolean };

export async function renderWord(
  bytes: ArrayBuffer,
  body: HTMLElement,
  styles: HTMLElement,
): Promise<WordRender> {
  body.textContent = "";
  styles.textContent = "";
  try {
    const { renderAsync } = await import("docx-preview");
    await renderAsync(bytes.slice(0), body, styles, {
      inWrapper: false,
      useBase64URL: true,
      renderAltChunks: false,
      ignoreLastRenderedPageBreak: false,
      breakPages: true,
    });
    return { pages: body.querySelectorAll("section.docx").length || 1, fallback: false };
  } catch {
    const page = document.createElement("section");
    page.className = "docx pv-word-plain";
    for (const line of await paragraphs(bytes)) {
      const p = document.createElement("p");
      p.textContent = line;
      page.appendChild(p);
    }
    body.appendChild(page);
    return { pages: 1, fallback: true };
  }
}

/** The document's paragraphs, straight from the file's own XML. */
async function paragraphs(bytes: ArrayBuffer): Promise<string[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes.slice(0));
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("This file could not be read as a Word document.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("w:p")]
    .map((p) =>
      [...p.getElementsByTagName("w:t")]
        .map((t) => t.textContent ?? "")
        .join("")
        .trim(),
    )
    .filter(Boolean);
}
