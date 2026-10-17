import { describe, expect, it } from "vitest";
import {
  activeMention,
  insertMention,
  matchCandidates,
  segmentBody,
  survivingMentions,
} from "@/lib/mentions";

const TEAM = [
  { userId: "u1", name: "Podrick Robogo" },
  { userId: "u2", name: "Mawusi Kwame" },
  { userId: "u3", name: "Ama Serwaa" },
];

describe("activeMention — when the picker should open", () => {
  it("opens on an @ at the start", () => {
    expect(activeMention("@Pod", 4)).toEqual({ query: "Pod", start: 0 });
  });

  it("opens on an @ after a space", () => {
    expect(activeMention("Ask @Pod", 8)).toEqual({ query: "Pod", start: 4 });
  });

  it("opens on a bare @ with nothing typed yet", () => {
    expect(activeMention("Ask @", 5)).toEqual({ query: "", start: 4 });
  });

  /* An email address must not open a picker; it is the most common @ in legal
     writing and the picker appearing over it would be maddening. */
  it("ignores an @ inside a word", () => {
    expect(activeMention("write to podrick@example.com", 27)).toBeNull();
  });

  it("keeps matching across the single space inside a real name", () => {
    expect(activeMention("Ask @Podrick Rob", 16)).toEqual({ query: "Podrick Rob", start: 4 });
  });

  /* Two spaces means the sentence moved on. Without this the picker hangs
     around for the rest of the paragraph. */
  it("closes once the sentence carries on", () => {
    expect(activeMention("Ask @Podrick  please confirm", 28)).toBeNull();
  });

  it("closes at a newline", () => {
    expect(activeMention("Ask @Podrick\nand also", 21)).toBeNull();
  });

  it("reads the caret, not the end of the text", () => {
    expect(activeMention("Ask @Pod and then some", 8)).toEqual({ query: "Pod", start: 4 });
  });
});

describe("matchCandidates", () => {
  it("puts a name that starts with what was typed first", () => {
    const hits = matchCandidates("a", TEAM);
    expect(hits[0]!.name).toBe("Ama Serwaa");
  });

  it("still finds a name matched in the middle", () => {
    expect(matchCandidates("serwaa", TEAM).map((p) => p.userId)).toEqual(["u3"]);
  });

  it("offers the whole team for a bare @", () => {
    expect(matchCandidates("", TEAM)).toHaveLength(3);
  });

  it("offers nobody when nothing matches", () => {
    expect(matchCandidates("zzz", TEAM)).toEqual([]);
  });
});

describe("insertMention", () => {
  it("replaces the partial name and leaves the caret after it", () => {
    const result = insertMention("Ask @Pod", { query: "Pod", start: 4 }, 8, "Podrick Robogo");
    expect(result.text).toBe("Ask @Podrick Robogo ");
    expect(result.caret).toBe(20);
  });

  it("keeps what was written after the caret", () => {
    const result = insertMention(
      "Ask @Pod to confirm",
      { query: "Pod", start: 4 },
      8,
      "Podrick Robogo",
    );
    expect(result.text).toBe("Ask @Podrick Robogo  to confirm");
  });
});

describe("survivingMentions — deleting the name unmentions the person", () => {
  it("keeps somebody still named in the body", () => {
    expect(survivingMentions("Ask @Podrick Robogo to confirm", [TEAM[0]!])).toEqual(["u1"]);
  });

  /* The whole reason this function exists: picking a name and then deleting it
     before pressing Post must not mention them. */
  it("drops somebody whose name was deleted before sending", () => {
    expect(survivingMentions("Ask the team to confirm", [TEAM[0]!])).toEqual([]);
  });

  it("mentions nobody who was never picked, however the body reads", () => {
    expect(survivingMentions("Ask @Podrick Robogo to confirm", [])).toEqual([]);
  });

  it("does not mention the same person twice for two @s", () => {
    expect(
      survivingMentions("@Podrick Robogo and again @Podrick Robogo", [TEAM[0]!, TEAM[0]!]),
    ).toEqual(["u1"]);
  });

  it("handles several people", () => {
    expect(
      survivingMentions("@Podrick Robogo and @Ama Serwaa", [TEAM[0]!, TEAM[2]!]),
    ).toEqual(["u1", "u3"]);
  });
});

describe("segmentBody — what is drawn as a mention", () => {
  it("marks the recorded name and leaves the rest alone", () => {
    expect(segmentBody("Ask @Podrick Robogo to confirm", ["Podrick Robogo"])).toEqual([
      { text: "Ask ", mentioned: false },
      { text: "@Podrick Robogo", mentioned: true },
      { text: " to confirm", mentioned: false },
    ]);
  });

  /* A name typed by hand and never picked is plain text, because nobody was
     told about it. Drawing it as a mention would be the interface claiming
     something the database does not record. */
  it("leaves an unrecorded name as plain text", () => {
    expect(segmentBody("Ask @Podrick Robogo to confirm", [])).toEqual([
      { text: "Ask @Podrick Robogo to confirm", mentioned: false },
    ]);
  });

  it("prefers the longer name where one contains the other", () => {
    expect(segmentBody("@Ama Serwaa replied", ["Ama", "Ama Serwaa"])).toEqual([
      { text: "@Ama Serwaa", mentioned: true },
      { text: " replied", mentioned: false },
    ]);
  });

  it("marks several mentions in one body", () => {
    expect(segmentBody("@Ama Serwaa and @Podrick Robogo", ["Ama Serwaa", "Podrick Robogo"])).toEqual(
      [
        { text: "@Ama Serwaa", mentioned: true },
        { text: " and ", mentioned: false },
        { text: "@Podrick Robogo", mentioned: true },
      ],
    );
  });

  it("handles an empty body", () => {
    expect(segmentBody("", ["Ama Serwaa"])).toEqual([]);
  });
});
