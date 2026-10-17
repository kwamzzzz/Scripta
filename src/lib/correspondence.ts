/**
 * Correspondence: a draft that is never sent, and the replies that came back.
 *
 * Scripta does not send email. It settles the wording, and it keeps a record of
 * what was said, so a piece of work carries its own correspondence instead of
 * leaving it in a mail client where only the person who received it can find
 * it. A reply is pasted in exactly as received — a reference log entry, not a
 * message.
 *
 * Written for Flow's email deliverables and proved there; this is the part with
 * no flow in it, so a task can keep correspondence the same way. What differs
 * between the two is only where the rows are stored and what they hang off:
 * Flow keeps its own in the browser record beside the deliverable, a task keeps
 * its own on the task row.
 */

/** A file that arrived with a reply. Bytes live behind `fileRef`, via lib/files. */
export type ThreadAttachment = {
  id: string;
  name: string;
  fileRef: string;
  bytes: number;
  mime: string;
};

/**
 * A file kept on the work itself rather than on a message within it.
 *
 * Attaching something to a task means one of three things, and they are worth
 * telling apart. A file from the lawyer's machine is uploaded and its bytes
 * live in the bucket. A document Scripta already holds is pointed at, not
 * copied — two copies of the same agreement is how a firm ends up arguing
 * about which one is current. A link is an address and no bytes at all, for
 * the portal or shared drive that will not move into Scripta.
 */
export type AttachmentKind = "file" | "document" | "link";

export type Attachment = ThreadAttachment & {
  kind: AttachmentKind;
  /** The document row this points at, when Scripta already holds it. */
  documentId?: string;
  /** The address, when this is a link. `fileRef` is empty then. */
  url?: string;
  addedAt: string;
};

/** What a link's chip carries in place of a file's type. */
export const LINK_MIME = "text/uri-list";

/**
 * One external reply, pasted in. It records what was said so the correspondence
 * can be found again — here, and by keyword in the mail client it lives in.
 */
export type ThreadEntry = {
  id: string;
  author: string;
  /**
   * Written by us rather than received.
   *
   * Correspondence is a back and forth, and the first version of this only
   * knew how to record the other side of it: there was one draft and a list of
   * replies, so logging your own second email meant filing it under the name
   * of the person you sent it to. A thread is messages in both directions, in
   * the order they happened.
   */
  mine?: boolean;
  /** The subject line, where the message carried one distinct from the task. */
  subject?: string;
  /** When the reply was received, if known. "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
  receivedAt?: string;
  /** The reply exactly as it was pasted. Never rewritten. */
  text: string;
  /** The same words, folded for searching. Rebuilt whenever `text` changes. */
  searchText: string;
  attachments: ThreadAttachment[];
  createdAt: string;
};

/** The draft. There is no send, anywhere, on purpose. */
export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
  /**
   * What goes out with it. Absent on every draft written before this existed,
   * so it is optional rather than an empty list nobody wrote.
   */
  attachments?: Attachment[];
  updatedAt: string;
};

/** More than this and the browser's own store is the wrong place for it. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const fmtBytes = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : bytes >= 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${bytes} bytes`;

/**
 * Fold text down to what a keyword search should reach.
 *
 * Addresses, references and hyphenated names survive intact, because those are
 * what a lawyer actually types when looking for a piece of correspondence.
 */
export const searchableText = (text: string) =>
  text
    .toLowerCase()
    // Curly quotes first, so don’t and don't fold to the same word.
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    // Keep what a keyword search needs inside a word: addresses, references,
    // hyphenated names. Everything else becomes a gap.
    .replace(/[^a-z0-9'@._-]+/g, " ")
    .split(" ")
    .map((word) => word.replace(/^['._-]+|['._-]+$/g, ""))
    .filter(Boolean)
    .join(" ");

/** Oldest first: by when the reply arrived, else when it was logged. */
export const threadWhen = (entry: ThreadEntry) => entry.receivedAt || entry.createdAt;

export const sortThreads = <T extends ThreadEntry>(entries: T[]): T[] =>
  [...entries].sort((a, b) => threadWhen(a).localeCompare(threadWhen(b)));

/**
 * Everything about a piece of correspondence a keyword should reach: the draft,
 * and every reply — authors and attachment names included, since those are how
 * correspondence is actually remembered.
 */
export function correspondenceSearchText(c: {
  threads: ThreadEntry[];
  emailDraft: EmailDraft | null;
}): string {
  return searchableText(
    [
      c.emailDraft
        ? `${c.emailDraft.to} ${c.emailDraft.subject} ${c.emailDraft.body} ${(
            c.emailDraft.attachments ?? []
          )
            .map((a) => a.name)
            .join(" ")}`
        : "",
      c.threads
        .map(
          (t) =>
            `${t.author} ${t.subject ?? ""} ${t.text} ${t.attachments
              .map((a) => a.name)
              .join(" ")}`,
        )
        .join(" "),
    ].join(" "),
  );
}
