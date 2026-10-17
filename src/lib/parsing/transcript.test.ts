import { describe, expect, it } from "vitest";
import { otterHeaderMeta, parseTranscriptText, secondsToLabel, tsToSeconds, UNSUPPORTED_TRANSCRIPT } from "./transcript";

const OTTER = `Transcript by Otter.ai

Sarah Lindqvist  1:12:35
Can we extend the term to align with our budget cycle? We'd prefer 36 months.

John Okafor  1:20:46
We can agree 36 months provided there is a
60-day termination for convenience.

Transcribed by https://otter.ai
`;

const SRT = `1
00:01:12,350 --> 00:01:15,000
Priya Sharma: Data protection must meet GDPR

2
00:01:15,000 --> 00:01:18,000
Priya Sharma: and CCPA.

3
00:01:19,000 --> 00:01:22,000
Mark Reyes: We can support 24-hour notice.
`;

const VTT = `WEBVTT

00:00:05.000 --> 00:00:08.000
<v Sarah Lindqvist>Payment terms — can we move to Net 45?

00:00:09.000 --> 00:00:12.000
<v John Okafor>We can do Net 45 with ACH payments.
`;

describe("timestamps", () => {
  it("normalises to hh:mm:ss", () => {
    expect(secondsToLabel(tsToSeconds("1:12:35")!)).toBe("01:12:35");
    expect(secondsToLabel(tsToSeconds("7:05")!)).toBe("00:07:05");
    expect(secondsToLabel(tsToSeconds("00:01:12.350")!)).toBe("00:01:12");
    expect(tsToSeconds("nope")).toBeNull();
  });
});

describe("otter text", () => {
  const p = parseTranscriptText(OTTER);

  it("strips header and promo, joins wrapped lines", () => {
    expect(p.format).toBe("otter-text");
    expect(p.utterances).toHaveLength(2);
    expect(p.utterances[1]!.text).toBe("We can agree 36 months provided there is a 60-day termination for convenience.");
    expect(p.utterances[0]!.ts).toBe("01:12:35");
  });

  it("collects speakers with samples", () => {
    expect(p.speakers.map((s) => s.key)).toEqual(["Sarah Lindqvist", "John Okafor"]);
    expect(p.durationMinutes).toBe(81);
  });

  it("tolerates a single space before the timestamp", () => {
    const r = parseTranscriptText("Speaker 1 0:01\nHello there.\n\nSpeaker 2 0:09\nHi.");
    expect(r.utterances.map((u) => u.speakerKey)).toEqual(["Speaker 1", "Speaker 2"]);
  });
});

describe("captions", () => {
  it("merges consecutive cues from the same speaker (srt)", () => {
    const p = parseTranscriptText(SRT);
    expect(p.format).toBe("srt");
    expect(p.utterances).toHaveLength(2);
    expect(p.utterances[0]!.text).toBe("Data protection must meet GDPR and CCPA.");
    expect(p.utterances[0]!.ts).toBe("00:01:12");
  });

  it("reads vtt voice tags", () => {
    const p = parseTranscriptText(VTT);
    expect(p.format).toBe("vtt");
    expect(p.utterances.map((u) => u.speakerName)).toEqual(["Sarah Lindqvist", "John Okafor"]);
  });
});

describe("fallbacks", () => {
  it("parses bracketed timestamps", () => {
    const p = parseTranscriptText("[00:12:35] Priya: One.\n[00:13:00] Mark: Two.");
    expect(p.format).toBe("bracket");
    expect(p.utterances[1]!.ts).toBe("00:13:00");
  });

  it("parses plain Speaker: text", () => {
    const p = parseTranscriptText("Priya: One point.\nMark: Another point.");
    expect(p.format).toBe("colon");
    expect(p.utterances).toHaveLength(2);
  });

  it("accepts a single-utterance transcript", () => {
    const p = parseTranscriptText("Sarah Lindqvist  0:42\nA short but valid transcript.\n");
    expect(p.utterances).toHaveLength(1);
    expect(p.utterances[0]!.text).toBe("A short but valid transcript.");
  });

  it("accepts a one-speaker SRT merged to a single utterance", () => {
    const p = parseTranscriptText(`1
00:00:10,000 --> 00:00:13,000
Sarah: First point.

2
00:00:14,000 --> 00:00:17,000
Sarah: Second point.
`);
    expect(p.format).toBe("srt");
    expect(p.utterances).toHaveLength(1);
    expect(p.utterances[0]!.text).toBe("First point. Second point.");
  });

  it("accepts unlabelled SRT with a placeholder speaker and gap-based splitting", () => {
    const p = parseTranscriptText(`1
00:00:12,000 --> 00:00:15,000
Can we extend the term to align with our budget?

2
00:00:14,000 --> 00:00:16,000
We would prefer 36 months.

3
00:00:19,000 --> 00:00:22,000
We can agree 36 months.
`);
    expect(p.format).toBe("srt");
    expect(p.utterances).toHaveLength(2); // cues 1-2 merge (≤2s gap), cue 3 stands alone
    expect(p.utterances[0]!.text).toBe("Can we extend the term to align with our budget? We would prefer 36 months.");
    expect(p.utterances[0]!.speakerKey).toBe("Speaker 1");
    expect(p.utterances[0]!.speakerName).toBeNull();
    expect(p.speakers).toEqual([{ key: "Speaker 1", name: null, sample: p.utterances[0]!.text.slice(0, 160), count: 2 }]);
  });

  it("accepts unlabelled VTT with a placeholder speaker", () => {
    const p = parseTranscriptText(`WEBVTT

00:00:05.000 --> 00:00:08.000
First caption line.

00:00:20.000 --> 00:00:23.000
Second caption line.
`);
    expect(p.format).toBe("vtt");
    expect(p.utterances).toHaveLength(2);
    expect(p.utterances.every((u) => u.speakerKey === "Speaker 1" && u.speakerName === null)).toBe(true);
  });

  it("derives duration from the maximum timestamp, not document order", () => {
    const p = parseTranscriptText("A  10:00\nLate.\n\nB  0:05\nEarly.");
    expect(p.durationMinutes).toBe(10);
  });

  it("refuses prose rather than dumping it in", () => {
    expect(() => parseTranscriptText("Just some prose.\n\nAnd more prose without any speakers.")).toThrow(
      UNSUPPORTED_TRANSCRIPT,
    );
  });
});

describe("turn markers in unlabelled captions", () => {
  it("treats >> as a turn boundary with alternating speakers and strips the marker", () => {
    const p = parseTranscriptText(`WEBVTT

00:00:05.000 --> 00:00:08.000
>> Can we extend the term?

00:00:09.000 --> 00:00:12.000
>> We can agree 36 months.

00:00:13.000 --> 00:00:16.000
>> Data protection must meet GDPR.
`);
    expect(p.utterances.map((u) => u.text)).toEqual([
      "Can we extend the term?",
      "We can agree 36 months.",
      "Data protection must meet GDPR.",
    ]);
    expect(p.utterances.map((u) => u.speakerKey)).toEqual(["Speaker 1", "Speaker 2", "Speaker 1"]);
    expect(p.utterances.every((u) => !u.text.includes(">"))).toBe(true);
  });

  it("treats >>> as a turn boundary too", () => {
    const p = parseTranscriptText(`1
00:00:01,000 --> 00:00:03,000
>> Term first.

2
00:00:04,000 --> 00:00:06,000
>>> Now data protection.
`);
    expect(p.utterances).toHaveLength(2);
    expect(p.utterances[1]!.text).toBe("Now data protection.");
    expect(p.utterances.map((u) => u.speakerKey)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("splits multiple >> turns inside a single cue", () => {
    const p = parseTranscriptText(`1
00:00:01,000 --> 00:00:05,000
>> Can we extend the term?
>> We can agree 36 months.
`);
    expect(p.utterances.map((u) => u.text)).toEqual(["Can we extend the term?", "We can agree 36 months."]);
    expect(p.utterances.map((u) => u.speakerKey)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("splits a multi-line dashed cue into alternating utterances", () => {
    const p = parseTranscriptText(`1
00:00:01,000 --> 00:00:05,000
- Can we extend the term?
- We can agree 36 months.
`);
    expect(p.utterances.map((u) => u.text)).toEqual(["Can we extend the term?", "We can agree 36 months."]);
    expect(p.utterances.map((u) => u.speakerKey)).toEqual(["Speaker 1", "Speaker 2"]);
  });

  it("does not treat a single leading dash as a turn marker", () => {
    const p = parseTranscriptText(`1
00:00:01,000 --> 00:00:05,000
- a hyphenated fragment stays intact
and continues here.
`);
    expect(p.utterances).toHaveLength(1);
    expect(p.utterances[0]!.text).toBe("- a hyphenated fragment stays intact and continues here.");
    expect(p.utterances[0]!.speakerKey).toBe("Speaker 1");
  });

  it("still extracts an in-cue NAME: label with no marker left behind", () => {
    const p = parseTranscriptText(`1
00:00:01,000 --> 00:00:04,000
>> SARAH: Can we extend the term?

2
00:00:05,000 --> 00:00:08,000
>> John Okafor: We can agree 36 months.
`);
    expect(p.utterances.map((u) => u.speakerName)).toEqual(["SARAH", "John Okafor"]);
    expect(p.utterances[0]!.text).toBe("Can we extend the term?");
  });
});


describe("otterHeaderMeta", () => {
  const HEADER = `Share Option Agreement Review
Mon, Aug 31, 2026 11:02AM • 1:40:15
SUMMARY KEYWORDS
share allocation, call option
SPEAKERS
Speaker 1, Speaker 2

Speaker 1 00:01
Right, shall we begin.

Speaker 2 00:24
Yes, let's.`;

  it("takes the real meeting title from the header", () => {
    expect(otterHeaderMeta(HEADER).title).toBe("Share Option Agreement Review");
  });

  it("takes the meeting date rather than the upload date", () => {
    expect(otterHeaderMeta(HEADER).date).toBe("2026-08-31");
  });

  it("takes the stated duration rather than inferring from timestamps", () => {
    expect(otterHeaderMeta(HEADER).durationMinutes).toBe(100);
  });

  it("returns nulls when there is no Otter header", () => {
    const m = otterHeaderMeta("Sarah  0:04\nMorning.");
    expect(m).toEqual({ title: null, date: null, durationMinutes: null });
  });

  it("does not mistake a speaker line for the header", () => {
    expect(otterHeaderMeta("Speaker 1 00:01\nHello there.").title).toBeNull();
  });
});
