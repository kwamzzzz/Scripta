/**
 * Transcript ingestion. Otter.ai is the first-class source: its text export,
 * and the .srt / .vtt it produces. Generic `[hh:mm:ss] Speaker: text` and
 * `Speaker: text` shapes are tried last.
 *
 * Everything normalises to a list of utterances with `hh:mm:ss` timestamps —
 * the form the decision map already renders.
 */

export type Utterance = {
  /** Stable key for the mapping panel — the raw label the file gave us. */
  speakerKey: string;
  /** Real name when the source supplied one, else null. */
  speakerName: string | null;
  ts: string;
  seconds: number;
  text: string;
};

export type TranscriptFormat = "otter-text" | "srt" | "vtt" | "bracket" | "colon";

export type ParsedTranscript = {
  format: TranscriptFormat;
  utterances: Utterance[];
  durationMinutes: number;
  speakers: { key: string; name: string | null; sample: string; count: number }[];
};

export const UNSUPPORTED_TRANSCRIPT =
  "This file doesn’t look like a transcript. Supported: Otter.ai text export (.txt/.docx/.pdf), Otter .srt / .vtt captions, or lines in the form “[00:12:35] Speaker: text” or “Speaker: text”.";

const TS = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?:[.,](\d{1,3}))?$/;

export function tsToSeconds(raw: string): number | null {
  const m = TS.exec(raw.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] === undefined ? null : Number(m[3]);
  return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
}

export function secondsToLabel(total: number): string {
  const s = Math.max(0, Math.round(total));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const PROMO =
  /^(transcript(ed)? by otter\.ai|transcribed by https?:\/\/otter\.ai|https?:\/\/otter\.ai.*|otter\.ai.*|page \d+ of \d+)$/i;

const cleanLines = (raw: string): string[] =>
  raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\u00a0/g, " ").trimEnd())
    .filter((l, i, arr) => !(PROMO.test(l.trim()) && (i < 3 || i > arr.length - 4)));

/** `{name}{2+ spaces or tab}{timestamp}` — a single space is allowed only when the tail is a timestamp. */
function speakerLine(line: string): { name: string; seconds: number } | null {
  const m = /^(.{1,80}?)[ \t]+(\d{1,2}:[0-5]\d(?::[0-5]\d)?)\s*$/.exec(line.trim());
  if (!m) return null;
  const name = m[1]!.trim().replace(/[:\-–]$/, "").trim();
  if (!name || /\d:\d/.test(name)) return null;
  const seconds = tsToSeconds(m[2]!);
  return seconds === null ? null : { name, seconds };
}

function parseOtterText(lines: string[]): Utterance[] {
  const out: Utterance[] = [];
  let current: { name: string; seconds: number; parts: string[] } | null = null;

  const flush = () => {
    if (current && current.parts.length) {
      const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
      if (text)
        out.push({
          speakerKey: current.name,
          speakerName: current.name,
          ts: secondsToLabel(current.seconds),
          seconds: current.seconds,
          text,
        });
    }
    current = null;
  };

  for (const line of lines) {
    const head = speakerLine(line);
    if (head) {
      flush();
      current = { name: head.name, seconds: head.seconds, parts: [] };
      continue;
    }
    if (!line.trim()) {
      // Blank lines before the body are just DOCX/PDF paragraph spacing.
      if (current && current.parts.length) flush();
      continue;
    }
    if (current) current.parts.push(line.trim());
  }
  flush();
  return out;
}

type Cue = { seconds: number; speaker: string | null; text: string; turn: boolean };

/** `SARAH:`, `Sarah Lindqvist:`, `Sarah —` — only when it is short and name-shaped,
 *  so a sentence that merely contains a colon is never mangled. */
function nameLabel(text: string): { name: string; rest: string } | null {
  const m = /^([^:—–]{1,40})(:|\s+[—–])\s+(.*)$/.exec(text);
  if (!m) return null;
  const name = m[1]!.trim();
  const rest = m[3]!.trim();
  if (!name || !rest) return null;
  const words = name.split(/\s+/);
  if (words.length > 4) return null;
  // Every word must be capitalised — "Payment terms — …" is prose, not a label.
  const shape = m[2] === ":" ? /^[\p{Lu}][\p{L}'’.-]*$/u : /^[\p{Lu}][\p{L}'’.-]*$/u;
  if (!words.every((w) => shape.test(w))) return null;
  return { name, rest };
}


/** `>>` is the broadcast-captioning turn marker (Zoom / Teams / YouTube emit it);
 *  `>>>` additionally signals a topic change. Both start a new turn, and neither
 *  may survive into the stored text. */
function splitTurnMarkers(lines: string[]): { text: string; turn: boolean }[] | null {
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!/>{2,}/.test(joined)) return null;
  const parts = joined
    .split(/\s*>{2,}\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  // Text before the first marker is a continuation of the previous turn.
  const leading = /^\s*>{2,}/.test(joined);
  return parts.map((text, i) => ({ text, turn: leading || i > 0 }));
}

/** `- ` prefixed lines alternate speakers inside one SRT cue. A single leading dash
 *  is far more likely to be a bullet or a hyphenated fragment, so require two. */
function splitDashTurns(lines: string[]): { text: string; turn: boolean }[] | null {
  const dashed = lines.filter((l) => /^[-–—]\s+/.test(l));
  if (dashed.length < 2) return null;
  const out: { text: string; turn: boolean }[] = [];
  for (const line of lines) {
    if (/^[-–—]\s+/.test(line)) out.push({ text: line.replace(/^[-–—]\s+/, "").trim(), turn: true });
    else if (out.length) out[out.length - 1]!.text = `${out[out.length - 1]!.text} ${line.trim()}`.trim();
    else out.push({ text: line.trim(), turn: false });
  }
  return out.filter((p) => p.text);
}

function parseCues(raw: string): { cues: Cue[]; format: "srt" | "vtt" } | null {
  const isVtt = /^\s*WEBVTT/.test(raw);
  const body = raw.replace(/\r\n?/g, "\n").replace(/^\s*WEBVTT[^\n]*\n/, "");
  const blocks = body.split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx === -1) continue;
    const start = lines[idx]!.split("-->")[0]!.trim().replace(",", ".");
    const seconds = tsToSeconds(start);
    if (seconds === null) continue;

    let voiceSpeaker: string | null = null;
    const clean: string[] = [];
    for (const line of lines.slice(idx + 1)) {
      let t = line.trim();
      const voice = /^<v\s+([^>]+)>\s*([\s\S]*)$/.exec(t);
      if (voice) {
        voiceSpeaker = voiceSpeaker ?? voice[1]!.trim();
        t = voice[2]!.replace(/<\/v>\s*$/, "").trim();
      }
      t = t.replace(/<[^>]+>/g, "").trim();
      if (t) clean.push(t);
    }
    if (!clean.length) continue;

    const segments = splitTurnMarkers(clean) ??
      splitDashTurns(clean) ?? [{ text: clean.join(" ").replace(/\s+/g, " ").trim(), turn: false }];

    for (const seg of segments) {
      let speaker = voiceSpeaker;
      let text = seg.text;
      if (!speaker) {
        const label = nameLabel(text);
        if (label) {
          speaker = label.name;
          text = label.rest;
        }
      }

      if (text) cues.push({ seconds, speaker, text, turn: seg.turn });
    }
  }
  if (!cues.length) return null;
  return { cues, format: isVtt ? "vtt" : "srt" };
}

/** Consecutive cues from the same speaker are one utterance — a 67-minute meeting must not become hundreds of fragments.
 *  Unlabelled captions (no diarisation) all map to a placeholder speaker, so they only merge when the gap is ≤ 2s —
 *  otherwise the whole file would collapse into one giant utterance and individual points couldn't be linked. */
const UNLABELLED_MERGE_GAP_S = 2;

function mergeCues(cues: Cue[]): Utterance[] {
  const out: Utterance[] = [];
  const marked = cues.some((c) => c.turn);
  // Two-party alternation is the right default for captioned dialogue; the
  // turn-assignment panel is where the user corrects it.
  let turnIndex = 0;
  for (const c of cues) {
    let key: string;
    if (c.speaker) key = c.speaker;
    else if (marked) {
      if (c.turn) turnIndex += 1;
      key = `Speaker ${turnIndex === 0 ? 1 : ((turnIndex - 1) % 2) + 1}`;
    } else key = "Speaker 1";

    const last = out[out.length - 1];
    const continues =
      last &&
      last.speakerKey === key &&
      !c.turn &&
      (c.speaker !== null || marked || c.seconds - last.seconds <= UNLABELLED_MERGE_GAP_S);
    if (continues) {
      last.text = `${last.text} ${c.text}`.replace(/\s+/g, " ").trim();
      continue;
    }
    out.push({
      speakerKey: key,
      speakerName: c.speaker,
      ts: secondsToLabel(c.seconds),
      seconds: c.seconds,
      text: c.text,
    });
  }
  return out;
}


function parseBracket(lines: string[]): Utterance[] {
  const out: Utterance[] = [];
  for (const line of lines) {
    const m = /^[[(](\d{1,2}:[0-5]\d(?::[0-5]\d)?)[\])]\s*([^:]{1,60}):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const seconds = tsToSeconds(m[1]!);
    if (seconds === null) continue;
    const name = m[2]!.trim();
    out.push({ speakerKey: name, speakerName: name, ts: secondsToLabel(seconds), seconds, text: m[3]!.trim() });
  }
  return out;
}

function parseColon(lines: string[]): Utterance[] {
  const out: Utterance[] = [];
  let seconds = 0;
  for (const line of lines) {
    const m = /^([A-Z][^:]{0,60}):\s+(.+)$/.exec(line.trim());
    if (!m) {
      const last = out[out.length - 1];
      if (last && line.trim()) last.text = `${last.text} ${line.trim()}`.replace(/\s+/g, " ");
      continue;
    }
    const name = m[1]!.trim();
    out.push({ speakerKey: name, speakerName: name, ts: secondsToLabel(seconds), seconds, text: m[2]!.trim() });
    seconds += 30;
  }
  return out;
}

/**
 * Otter puts the real meeting title, start time and duration in a header block
 * above the transcript:
 *
 *   Share Option Agreement Review
 *   Mon, Aug 31, 2026 11:02AM • 1:40:15
 *
 * Without this the app falls back to the filename and the upload date, which is
 * wrong whenever a transcript is imported some days after the meeting.
 */
export type OtterMeta = { title: string | null; date: string | null; durationMinutes: number | null };

export function otterHeaderMeta(raw: string): OtterMeta {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  const out: OtterMeta = { title: null, date: null, durationMinutes: null };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // "Mon, Aug 31, 2026 11:02AM • 1:40:15"  (duration optional)
    const m = /^(.+?)\s+[•·]\s+(\d{1,2}:\d{2}(?::\d{2})?)$/.exec(line);
    if (!m) continue;
    const when = new Date(m[1]!.replace(/(\d)(AM|PM)$/i, "$1 $2"));
    if (!Number.isNaN(when.getTime())) out.date = when.toISOString().slice(0, 10);
    const secs = tsToSeconds(m[2]!);
    if (secs != null) out.durationMinutes = Math.max(1, Math.round(secs / 60));
    // The title is the line immediately above, when it is not a section label.
    const prev = i > 0 ? lines[i - 1]! : null;
    if (prev && !/^(summary keywords|speakers)$/i.test(prev) && !speakerLine(prev)) out.title = prev;
    break;
  }
  return out;
}

export function parseTranscriptText(raw: string): ParsedTranscript {
  const lines = cleanLines(raw);
  let format: TranscriptFormat = "otter-text";
  let utterances: Utterance[] = [];

  const cues = raw.includes("-->") ? parseCues(raw) : null;
  if (cues) {
    format = cues.format;
    utterances = mergeCues(cues.cues);
  } else {
    utterances = parseOtterText(lines);
    if (utterances.length < 2) {
      const bracket = parseBracket(lines);
      if (bracket.length >= 2) {
        format = "bracket";
        utterances = bracket;
      } else {
        const colon = parseColon(lines);
        if (colon.length >= 2) {
          format = "colon";
          utterances = colon;
        }
      }
    }
  }

  if (utterances.length < 1) throw new Error(UNSUPPORTED_TRANSCRIPT);

  const speakers: ParsedTranscript["speakers"] = [];
  for (const u of utterances) {
    const found = speakers.find((s) => s.key === u.speakerKey);
    if (found) {
      found.count += 1;
      if (found.sample.length < 40 && u.text.length > found.sample.length) found.sample = u.text;
    } else {
      speakers.push({ key: u.speakerKey, name: u.speakerName, sample: u.text, count: 1 });
    }
  }

  const maxSeconds = Math.max(...utterances.map((u) => u.seconds));
  return {
    format,
    utterances,
    durationMinutes: Math.max(1, Math.round(maxSeconds / 60)),
    speakers: speakers.map((s) => ({ ...s, sample: s.sample.slice(0, 160) })),
  };
}
