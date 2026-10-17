/**
 * What a provision needs around it for another system to understand it.
 *
 * Splitting a contract into the provisions a lawyer works on made analysis
 * granular and, on its own, made it shallower: a definition that used to be
 * reviewed inside a thirty-definition block is now reviewed alone, and
 * "'Liability' means any liability whatsoever" says very little by itself.
 * Granularity without context is a worse answer, not a better one.
 *
 * So this is the bridge between the document model and any workflow that has
 * to reason about one provision. Contract Review is the first consumer; the
 * same question — what does this provision need around it? — is asked by
 * drafting, by the assistant, by precedent comparison and by a playbook
 * check, and none of them should answer it separately.
 *
 * Two rules hold the design together.
 *
 * IT RETRIEVES, IT DOES NOT INTERPRET. The packet may say that 8.3(b)
 * references 8.1, because the document says so. It may not say that 8.3(b) is
 * an exception to the cap in 8.1 — that is a legal conclusion, and it belongs
 * to a reasoning layer that has actually reached it.
 *
 * MINIMUM SUFFICIENT, NOT MAXIMUM AVAILABLE. Everything included has to earn
 * its place: ancestors because they say what the provision is doing, siblings
 * by title only because their wording is a different review, definitions
 * because the target actually uses them. The whole point of the document model
 * is to retrieve the right context rather than to afford sending all of it.
 *
 * It returns data. Each consumer renders its own prompt, because drafting and
 * review need the same facts arranged differently.
 */

import { isPartOf, sectionOf, type Reference, type ReferenceType } from "@/lib/subclauses";
import { readingDoc, reviewBody } from "@/lib/review-reading";

/* ------------------------------------------------------------------ types */

export type PacketProvision = {
  id: string;
  num: string;
  title: string;
  kind: string | null;
  /** Present where the wording was retrieved; absent where only the label was. */
  text?: string;
};

export type ResolvedReference = {
  type: ReferenceType;
  /** Exactly as the source wrote it. */
  target: string;
  /** The provision it points at, where one was found in this document. */
  resolved: PacketProvision | null;
};

export type PacketRule = {
  id: string;
  topic: string;
  preferred: string | null;
  fallback: string | null;
  redflag: string | null;
  approvedText: string | null;
};

export type ContextPacket = {
  target: PacketProvision & { page: string | null };
  /** Outermost first: section, then any intermediate parent. */
  ancestors: PacketProvision[];
  /** Title and number only. Their wording is a different review. */
  siblings: PacketProvision[];
  /** What the target points at, resolved where possible and kept where not. */
  references: ResolvedReference[];
  /** Only the terms this provision actually uses. */
  definitions: PacketProvision[];
  document: {
    matterId: string;
    matterName: string;
    matterType: string | null;
    governingLaw: string | null;
    actingFor: string | null;
    actingRole: string | null;
    instructions: string | null;
  };
  guidance: {
    /** Rules plausibly in scope, not the whole playbook. */
    rules: PacketRule[];
    /** True when nothing matched and the whole set is being offered instead. */
    rulesUnfiltered: boolean;
    standingInstructions: string[];
    decidedIssues: string[];
  };
};

/* -------------------------------------------------- pure selection rules */

/** Every ancestor number of "8.3.1": ["8", "8.3"]. Outermost first. */
export function ancestorNums(num: string): string[] {
  const parts = num.trim().replace(/\.$/, "").split(".");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("."));
  return out;
}

/** Whether `num` is a direct child of `parent`: "8.3" of "8", not "8.3.1". */
export function isDirectChild(num: string, parent: string): boolean {
  const child = num.trim().replace(/\.$/, "");
  const head = parent.trim().replace(/\.$/, "");
  if (!child.startsWith(`${head}.`)) return false;
  return !child.slice(head.length + 1).includes(".");
}

/**
 * The defined terms a provision actually uses.
 *
 * Definitions arrive titled by the term they define — `“Business Day”` — so
 * matching is looking for that term in the target's wording. Deterministic on
 * purpose: a capitalised term in a contract is a defined term by convention,
 * and asking a model to spot them would cost money to answer a question the
 * document already answers.
 *
 * Word boundaries matter. "Fees" must not match "Fees and Expenses" as a
 * different term, and "Act" must not match "Acting".
 */
export function definitionsUsedBy(text: string, definitions: PacketProvision[]) {
  const hay = text.toLowerCase();
  return definitions.filter((d) => {
    const term = d.title.replace(/^[“"']+|[”"']+$/g, "").trim();
    if (term.length < 3) return false;
    const at = hay.indexOf(term.toLowerCase());
    if (at < 0) return false;
    const before = at === 0 ? " " : hay[at - 1]!;
    const after = hay[at + term.length] ?? " ";
    return !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after);
  });
}

const STOP = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "to",
  "for",
  "in",
  "on",
  "with",
  "by",
  "from",
  "as",
  "this",
  "that",
  "clause",
  "clauses",
  "section",
  "agreement",
  "party",
  "parties",
  "shall",
  "any",
  "all",
  "other",
  "its",
]);

/** The words in a title worth matching on. */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Playbook rules plausibly in scope for this provision.
 *
 * Today every rule in the playbook goes into every call, so a fifty-rule
 * playbook is fifty rules of noise per clause and the cost is rules × clauses.
 * This narrows on the signals the document already gives — the provision's own
 * title and the titles above it, against the rule's topic.
 *
 * It is retrieval, not judgement: the model still decides which rule governs.
 * So when nothing matches, the whole set is returned rather than none, and the
 * caller is told that happened. No signal is a reason to stay quiet, not a
 * reason to pretend the answer is "no rules apply".
 */
export function plausibleRules(
  titles: string[],
  rules: PacketRule[],
): { rules: PacketRule[]; unfiltered: boolean } {
  const words = new Set(titles.flatMap(keywords));
  if (!words.size || !rules.length) return { rules, unfiltered: true };
  const matched = rules.filter((r) => keywords(r.topic).some((w) => words.has(w)));
  return matched.length ? { rules: matched, unfiltered: false } : { rules, unfiltered: true };
}

/** How a schedule-like reference is filed as a clause: "Schedule 1", "Annex A". */
const SCHEDULE_LABEL: Partial<Record<Reference["type"], string>> = {
  schedule: "Schedule",
  annex: "Annex",
  appendix: "Appendix",
  exhibit: "Exhibit",
};

/**
 * Resolve what a reference points at, within this document.
 *
 * Clauses resolve by number; schedules, annexes, appendices and exhibits
 * resolve to the section the parser filed them under ("Schedule 1"), because
 * they are part of the contract and held as clause rows like the rest of it.
 * An unresolved reference is kept rather than dropped: that the target could
 * not be found is itself worth knowing (a schedule the agreement relies on and
 * does not attach), and discarding it would make the provision look as though
 * it pointed nowhere.
 */
export function resolveReferences(
  refs: Reference[],
  byNum: Map<string, PacketProvision>,
): ResolvedReference[] {
  return refs.map((ref) => {
    const target = ref.target.trim().replace(/\.$/, "");
    const label = SCHEDULE_LABEL[ref.type];
    return {
      type: ref.type,
      target: ref.target,
      resolved:
        ref.type === "clause" || ref.type === "section"
          ? (byNum.get(target) ?? null)
          : label
            ? (byNum.get(`${label} ${target.toUpperCase()}`) ?? null)
            : null,
    };
  });
}

export { sectionOf };

/* ------------------------------------------------------------- assembly */

type Row = {
  id: string;
  num: string | null;
  title: string | null;
  kind: string | null;
  refs: unknown;
  page_ref: string | null;
};

const asProvision = (r: Row): PacketProvision => ({
  id: r.id,
  num: (r.num ?? "").trim(),
  title: (r.title ?? "").trim(),
  kind: r.kind,
});

/**
 * A definition, for documents parsed before `kind` was recorded.
 *
 * Those rows have kind null, which is honest — nothing was written down — but
 * it would leave every older contract with no defined terms at all. The title
 * of a definition is the term in quotes, which is a reliable enough fallback
 * and costs one string test.
 */
const looksLikeDefinition = (r: Row) =>
  r.kind === "definition" || /^[“"']/.test((r.title ?? "").trim());

const readRefs = (value: unknown): Reference[] =>
  Array.isArray(value)
    ? value.filter(
        (r): r is Reference => !!r && typeof r === "object" && "type" in r && "target" in r,
      )
    : [];

/**
 * Build a packet for each of `clauseIds`, reading the document once.
 *
 * Two passes on purpose. The first loads the document's shape — numbers,
 * titles, kinds, references — which is small even for a long agreement. Only
 * then is wording fetched, and only for the provisions that earned a place:
 * the targets, what they reference, the definitions they use, and their
 * ancestors. A hundred-clause contract does not become a hundred clauses of
 * prose in memory to review three of them.
 */
export async function buildContextPackets(
  supabase: {
    from: (t: string) => any;
  },
  matterId: string,
  clauseIds: string[],
): Promise<Map<string, ContextPacket>> {
  const packets = new Map<string, ContextPacket>();
  if (!clauseIds.length) return packets;

  const [{ data: matter }, { data: index }] = await Promise.all([
    supabase
      .from("matters")
      .select(
        "id, name, matter_type, governing_law, review_for, review_role, review_instructions, playbook_id",
      )
      .eq("id", matterId)
      .maybeSingle(),
    supabase
      .from("clauses")
      .select("id, num, title, kind, refs, page_ref")
      .eq("matter_id", matterId)
      .order("ordinal"),
  ]);

  const rows: Row[] = (index ?? []) as Row[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byNum = new Map<string, PacketProvision>();
  for (const r of rows) {
    const num = (r.num ?? "").trim().replace(/\.$/, "");
    if (num && !byNum.has(num)) byNum.set(num, asProvision(r));
  }
  const definitions = rows.filter(looksLikeDefinition).map(asProvision);
  const partsOf = (num: string) =>
    rows.filter((r) => isPartOf((r.num ?? "").trim(), num.trim().replace(/\.$/, "")));

  // Decide what is needed before any wording is read.
  const plan = new Map<
    string,
    {
      target: Row;
      ancestors: PacketProvision[];
      siblings: PacketProvision[];
      references: ResolvedReference[];
    }
  >();
  const wanted = new Set<string>();

  for (const id of clauseIds) {
    const target = byId.get(id);
    if (!target) continue;
    const num = (target.num ?? "").trim().replace(/\.$/, "");
    const parent = num.includes(".") ? num.slice(0, num.lastIndexOf(".")) : "";

    const ancestors = ancestorNums(num)
      .map((n) => byNum.get(n))
      .filter((p): p is PacketProvision => !!p);

    // Title and number only: a sibling's wording is a different review, and
    // including it would turn every 8.3(b) into a hidden review of clause 8.
    const siblings = parent
      ? rows
          .filter((r) => {
            const n = (r.num ?? "").trim().replace(/\.$/, "");
            return n !== num && isDirectChild(n, parent);
          })
          .map(asProvision)
      : [];

    const references = resolveReferences(readRefs(target.refs), byNum);

    plan.set(id, { target, ancestors, siblings, references });
    wanted.add(id);
    for (const a of ancestors) wanted.add(a.id);
    for (const r of references) {
      if (!r.resolved) continue;
      wanted.add(r.resolved.id);
      // A schedule is read whole: its table and every paragraph under it.
      if (SCHEDULE_LABEL[r.type]) for (const part of partsOf(r.resolved.num)) wanted.add(part.id);
    }
  }

  // Definitions are chosen from the target's own wording, so their text is
  // fetched in the same pass as everything else once the targets are known.
  const needed = [...wanted, ...definitions.map((d) => d.id)];
  const [{ data: docs }, { data: segs }] = await Promise.all([
    supabase.from("clauses").select("id, doc").in("id", needed),
    supabase
      .from("clause_segments")
      .select("clause_id, ordinal, text, kind")
      .in("clause_id", needed)
      .order("ordinal"),
  ]);

  /* ---------------------------------------------------------------------
     THE PACKET QUOTES THE CLAUSE, SO IT HAS TO QUOTE THE REAL ONE
     ---------------------------------------------------------------------

     This read `clause_segments` and dropped the deleted runs, described as
     "the amended reading" — which is If accepted, and is the right reading
     to put in front of the model. But `save_clause_doc` does not write
     segments, so the shadow has been frozen since Phase 5: every packet has
     been quoting the clause as it stood before any tracked edit, including
     the definitions the review reasons from.

     Same reading, taken from the document. Segments stay as the fallback for
     a clause with no document. */
  const textOf = new Map<string, string>();
  for (const s of (segs ?? []) as { clause_id: string; text: string; kind: string }[]) {
    if (s.kind === "d") continue;
    textOf.set(s.clause_id, `${textOf.get(s.clause_id) ?? ""}${s.text}`);
  }
  for (const row of (docs ?? []) as { id: string; doc: unknown }[]) {
    const doc = readingDoc(row.doc);
    if (doc) textOf.set(row.id, reviewBody(doc, []));
  }
  const withText = (p: PacketProvision): PacketProvision => {
    const text = (textOf.get(p.id) ?? "").trim();
    return text ? { ...p, text } : p;
  };
  /** A schedule with everything under it, each paragraph under its own number. */
  const scheduleWhole = (p: PacketProvision): PacketProvision => {
    const text = [
      (textOf.get(p.id) ?? "").trim(),
      ...partsOf(p.num).map((part) =>
        `${part.num} ${part.title ?? ""}\n${(textOf.get(part.id) ?? "").trim()}`.trim(),
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    return text ? { ...p, text } : p;
  };

  const playbookId = (matter as any)?.playbook_id ?? null;
  const { data: ruleRows } = playbookId
    ? await supabase
        .from("playbook_rules")
        .select("id, topic, preferred, fallback, redflag, approved_clause_text")
        .eq("playbook_id", playbookId)
        .order("ordinal")
    : { data: [] };
  const allRules: PacketRule[] = ((ruleRows ?? []) as any[]).map((r) => ({
    id: r.id,
    topic: r.topic ?? "",
    preferred: r.preferred ?? null,
    fallback: r.fallback ?? null,
    redflag: r.redflag ?? null,
    approvedText: r.approved_clause_text ?? null,
  }));

  for (const [id, p] of plan) {
    const targetText = (textOf.get(id) ?? "").trim();
    const used = definitionsUsedBy(targetText || p.target.title || "", definitions).map(withText);
    const titles = [p.target.title ?? "", ...p.ancestors.map((a) => a.title)].filter(Boolean);
    const narrowed = plausibleRules(titles, allRules);

    packets.set(id, {
      target: {
        ...asProvision(p.target),
        text: targetText,
        page: p.target.page_ref,
      },
      ancestors: p.ancestors.map(withText),
      siblings: p.siblings,
      references: p.references.map((r) =>
        r.resolved
          ? {
              ...r,
              resolved: SCHEDULE_LABEL[r.type] ? scheduleWhole(r.resolved) : withText(r.resolved),
            }
          : r,
      ),
      definitions: used,
      document: {
        matterId,
        matterName: (matter as any)?.name ?? "",
        matterType: (matter as any)?.matter_type ?? null,
        governingLaw: (matter as any)?.governing_law ?? null,
        actingFor: (matter as any)?.review_for ?? null,
        actingRole: (matter as any)?.review_role ?? null,
        instructions: (matter as any)?.review_instructions ?? null,
      },
      guidance: {
        rules: narrowed.rules,
        rulesUnfiltered: narrowed.unfiltered,
        standingInstructions: [],
        decidedIssues: [],
      },
    });
  }

  return packets;
}

/** One provision, for a caller that only has one. */
export async function buildContextPacket(
  supabase: { from: (t: string) => any },
  matterId: string,
  clauseId: string,
): Promise<ContextPacket | null> {
  const packets = await buildContextPackets(supabase, matterId, [clauseId]);
  return packets.get(clauseId) ?? null;
}

/* ------------------------------------------------------------- rendering */

/**
 * The packet as prose for a review prompt.
 *
 * Rendering lives beside the packet rather than inside it because each
 * consumer arranges the same facts differently — drafting wants the approved
 * wording first, review wants the mandate first. This is review's rendering;
 * another workflow writes its own over the same data.
 *
 * Every heading here states a structural fact. Nothing says what a reference
 * means, because the packet does not know: "8.3(b) refers to clause 8.1" is
 * in the document, "8.3(b) is an exception to the cap" is a conclusion.
 */
export function renderForReview(packet: ContextPacket): string {
  const lines: string[] = [];
  const p = packet.target;

  lines.push("THE PROVISION BEING REVIEWED:");
  lines.push(`${p.num} ${p.title}`.trim());
  lines.push(p.text || "(this provision is empty)");

  if (packet.ancestors.length) {
    lines.push("", "WHERE IT SITS — these are the provisions above it, outermost first:");
    for (const a of packet.ancestors) {
      lines.push(`${a.num} ${a.title}`.trim());
      // A section's lead-in often governs everything beneath it, so it is worth
      // its words. It is usually a sentence, not a clause.
      if (a.text) lines.push(a.text);
    }
  }

  if (packet.siblings.length) {
    lines.push(
      "",
      "ALONGSIDE IT — the other provisions at this level, listed so you know they exist. Their wording is not given and is not being reviewed here:",
    );
    for (const s of packet.siblings) lines.push(`${s.num} ${s.title}`.trim());
  }

  const resolved = packet.references.filter((r) => r.resolved);
  const unresolved = packet.references.filter((r) => !r.resolved);
  if (resolved.length) {
    lines.push(
      "",
      "IT REFERS TO THESE PROVISIONS — the document says so; what that means is for you to judge:",
    );
    for (const r of resolved) {
      lines.push(`${r.type} ${r.target} — ${r.resolved!.title}`.trim());
      if (r.resolved!.text) lines.push(r.resolved!.text);
    }
  }
  if (unresolved.length) {
    lines.push(
      "",
      `IT ALSO REFERS TO, AND THE TEXT IS NOT AVAILABLE HERE: ${unresolved
        .map((r) => `${r.type} ${r.target}`)
        .join("; ")}`,
    );
  }

  if (packet.definitions.length) {
    lines.push("", "DEFINED TERMS THIS PROVISION USES:");
    for (const d of packet.definitions) lines.push(d.text || `${d.num} ${d.title}`);
  }

  if (packet.guidance.rules.length) {
    lines.push(
      "",
      packet.guidance.rulesUnfiltered
        ? "PLAYBOOK RULES — the whole playbook, because none matched this provision by topic. Decide which, if any, governs it:"
        : "PLAYBOOK RULES that may govern this provision. Decide which, if any, actually does:",
    );
    for (const r of packet.guidance.rules) {
      lines.push(
        [
          `Rule ${r.id} — ${r.topic}`,
          r.preferred ? `Preferred: ${r.preferred}` : "",
          r.fallback ? `Fallback: ${r.fallback}` : "",
          r.redflag ? `Never accept: ${r.redflag}` : "",
          r.approvedText ? `Approved wording: ${r.approvedText}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  return lines.join("\n");
}
