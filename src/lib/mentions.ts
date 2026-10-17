/**
 * Naming a colleague in a thread.
 *
 * A mention means *look at this*. It creates nothing — no task, no row, no
 * notification — which is the decision that keeps Tasks meaning "what do I have
 * to do". The whole signal is one timestamp per person per matter:
 * `matter_members.mentions_seen_at`, read through
 * `matters_with_unseen_mentions()` and cleared by `mark_mentions_seen()`.
 *
 * ---------------------------------------------------------------------------
 * THE PICKER OFFERS THE MATTER TEAM AND NOBODY ELSE
 * ---------------------------------------------------------------------------
 *
 * This is the one control in Phase 4 able to pull somebody toward content they
 * are not entitled to. Phase 3 established that firm membership grants access
 * to zero matters, so a firm-wide picker would let a Lawyer with no place on a
 * file be named in its threads — and a person who is told "you were mentioned
 * in Atlas" has been told something about Atlas.
 *
 * The rule is enforced twice on purpose. Here, so the interface never offers a
 * name it would be refused for; and in `validate_comment_mentions()`, at write
 * time, because a rule the interface remembers is a rule that holds until the
 * next screen forgets it.
 *
 * ---------------------------------------------------------------------------
 * WHO WAS NAMED IS A FACT, RECORDED ONCE
 * ---------------------------------------------------------------------------
 *
 * `comments.mentions` is written at insert time and never re-derived. Parsing
 * the body on every read would be a second opinion about what the comment says,
 * and the two drift the moment somebody edits — a name removed from the text
 * would still be mentioned, or worse, a name typed into the text of an old
 * comment would silently become one.
 *
 * So the picker records an id when a name is chosen, and `survivingMentions`
 * drops any whose name is no longer in the body when the comment is sent.
 * Deleting "@Podrick" before pressing Post means Podrick is not mentioned,
 * which is what the person plainly intended.
 */

export type MentionCandidate = { userId: string; name: string };

/** Where the caret is inside an unfinished `@name`, if it is inside one. */
export type ActiveMention = { query: string; start: number };

/**
 * The `@…` being typed at the caret, or null.
 *
 * A mention starts at an `@` that begins the text or follows whitespace, so an
 * email address in the middle of a sentence does not open a picker. It ends at
 * the caret, and it may contain single spaces because real names have them —
 * "@Podrick Rob" has to keep matching while it is being typed. Two spaces in a
 * row end it, which is the cheapest rule that lets somebody type a sentence
 * after a mention without the picker hanging around.
 */
export function activeMention(text: string, caret: number): ActiveMention | null {
  const upTo = text.slice(0, caret);
  const at = upTo.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(upTo[at - 1]!)) return null;
  const query = upTo.slice(at + 1);
  if (query.includes("\n") || query.includes("  ")) return null;
  return { query, start: at };
}

/** The team members a partial `@…` could mean, best-known first. */
export function matchCandidates(
  query: string,
  team: MentionCandidate[],
  limit = 6,
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  const scored = team.filter((person) => person.name.toLowerCase().includes(needle));
  // A name that starts with what was typed is almost always the one meant.
  scored.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });
  return scored.slice(0, limit);
}

/** Replace the partial `@…` at `start` with the chosen name, and a space. */
export function insertMention(
  text: string,
  active: ActiveMention,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const before = text.slice(0, active.start);
  const after = text.slice(caret);
  const inserted = `@${name} `;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

/**
 * Of the people picked while writing, the ones still named in the body.
 *
 * Nothing is inferred here — a person is only a candidate because they were
 * chosen from the picker, which is what keeps this from mentioning somebody
 * whose name happens to appear in a sentence. Two colleagues with the same
 * display name are both dropped or both kept together, which is the honest
 * reading of an ambiguous `@Name` and the reason the picker shows the address
 * beside the name.
 */
export function survivingMentions(body: string, picked: MentionCandidate[]): string[] {
  const ids = picked.filter((person) => body.includes(`@${person.name}`)).map((p) => p.userId);
  return [...new Set(ids)];
}

/**
 * The body split into text and mentions, for rendering.
 *
 * Reads the stored ids rather than scanning for `@`, so a comment shows as a
 * mention exactly what was recorded as one. A name that was typed by hand and
 * never picked is plain text, and it should be: nobody was told about it.
 */
export type BodySegment = { text: string; mentioned: boolean };

export function segmentBody(body: string, mentionedNames: string[]): BodySegment[] {
  if (!mentionedNames.length) return [{ text: body, mentioned: false }];
  // Longest first, so "@Ama Serwaa" wins over "@Ama".
  const names = [...mentionedNames].sort((a, b) => b.length - a.length);
  const segments: BodySegment[] = [];
  let rest = body;
  while (rest.length) {
    let hitAt = -1;
    let hitName = "";
    for (const name of names) {
      const at = rest.indexOf(`@${name}`);
      if (at >= 0 && (hitAt < 0 || at < hitAt)) {
        hitAt = at;
        hitName = name;
      }
    }
    if (hitAt < 0) {
      segments.push({ text: rest, mentioned: false });
      break;
    }
    if (hitAt > 0) segments.push({ text: rest.slice(0, hitAt), mentioned: false });
    segments.push({ text: `@${hitName}`, mentioned: true });
    rest = rest.slice(hitAt + hitName.length + 1);
  }
  return segments.filter((s) => s.text.length > 0);
}
