/**
 * Hand a built file to the browser.
 *
 * One place, because every exporter had its own copy of the object-URL dance
 * and each one had to remember to revoke. A leaked object URL holds the whole
 * document in memory for the life of the tab.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";
