export const ACCEPTED_MIME = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/vtt",
  "application/x-subrip",
  "text/srt",
] as const;

export const ACCEPTED_EXT = [".docx", ".pdf", ".txt", ".md", ".vtt", ".srt"] as const;

export const ACCEPT_ATTR = ACCEPTED_EXT.join(",");

export function fileTypeError(file: { name: string; type: string }): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const okExt = (ACCEPTED_EXT as readonly string[]).includes(ext);
  const okMime = !file.type || (ACCEPTED_MIME as readonly string[]).includes(file.type);
  if (okExt && okMime) return null;
  return `${file.name} isn’t a supported format. Accepted: ${ACCEPTED_EXT.join(", ")}.`;
}

export function extOf(name: string): string {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}
