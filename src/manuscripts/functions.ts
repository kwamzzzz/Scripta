/**
 * Book Review: the passes that need a reader, not a rule.
 *
 * Atomise locally, reason globally. No call is given the whole book. A chapter
 * is read whole once, into a descriptive summary, a separate editorial
 * assessment and a list of the facts other chapters will be checked against.
 * Proofreading reads a few paragraphs at a time with the chapter's summary and
 * the style sheet beside them. The map and the cross-chapter pass read the
 * summaries and their facts, never the raw manuscript.
 *
 * Four safeguards hold throughout, and are checked in code rather than trusted
 * to the prompt:
 *
 *   A correction must quote words that are actually in the paragraph, or it is
 *   dropped.
 *   Every place a finding rests on must be a real atom of this version.
 *   Nothing is guessed: a contradiction is an author query, never a fix.
 *   No citation is ever invented to support a claim; an unsupported claim is
 *   flagged, not repaired.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured } from "@/lib/ai-gateway.server";
import {
  fingerprint,
  hash,
  type ChapterAssessment,
  type ChapterFact,
  type ChapterSummary,
  type DraftFinding,
  type Evidence,
  type FindingAction,
  type FindingCategory,
  type FindingSeverity,
  type ManuscriptMap,
  type ReviewPass,
  type StyleRule,
} from "./model";
import { asRaised, raisedLines, repeats, restates, type Raised } from "./dedupe";
import { parseSentenceKey, sentenceOf, splitSentences } from "./sentences";

type Sb = { supabase: any; userId: string };
/** A row as Supabase returns it: the generated types do not know these tables. */
type Row = any;

const FEATURE = "book-review";
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const oneOf = <T extends string>(options: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fallback;

const CATEGORIES = [
  "error",
  "consistency",
  "clarity",
  "style",
  "citation",
  "cross_reference",
  "coherence",
  "query",
  "suggestion",
] as const satisfies readonly FindingCategory[];
const SEVERITIES = ["critical", "material", "minor"] as const satisfies readonly FindingSeverity[];
const ACTIONS = ["correction", "query", "suggestion"] as const satisfies readonly FindingAction[];

/** Running prose and the things read like it. Tables, contents and the bibliography are not proofread as prose. */
const PROSE = new Set([
  "front",
  "chapter",
  "heading",
  "paragraph",
  "quote",
  "list_item",
  "caption",
  "footnote",
  "endnote",
]);

const EDITOR = `You are a senior manuscript editor working inside Scripta, reviewing a long academic or professional manuscript (a thesis, dissertation or book).

Your principles:
- Preserve the author's meaning, argument and voice. Never rewrite into generic prose. A sentence that is correct and merely not how you would put it is left alone.
- Distinguish clearly between a CORRECTION (objectively wrong: grammar, spelling, agreement, punctuation, a plain factual slip within the text itself), an AUTHOR QUERY (something only the author can decide, such as which of two conflicting dates is right, or whether two terms mean the same thing) and a SUGGESTION (optional improvement).
- Never guess. Where the manuscript contradicts itself, raise a query naming both versions; do not pick one.
- Never invent a citation, source, date, name or fact. If a material claim lacks support, say so as a query; do not supply support.
- Respect the manuscript's style sheet. A form the style sheet prefers is never flagged; a form it lists as a variant is.
- Substantive and structural judgments (argument, coherence, evidential support) are labelled as such and are never presented as grammatical errors.
- Write in plain British English. Be specific and brief. Do not use em-dashes.`;

function styleSheetText(rules: StyleRule[]) {
  const active = rules.filter((r) => r.active);
  if (!active.length) return "No style sheet rules yet.";
  return active
    .map(
      (r) =>
        `- [${r.category}] use "${r.preferred}"${r.variants.length ? ` not ${r.variants.map((v) => `"${v}"`).join(", ")}` : ""}${r.note ? ` (${r.note})` : ""}`,
    )
    .join("\n");
}

async function loadRules(supabase: Sb["supabase"], manuscriptId: string): Promise<StyleRule[]> {
  const { data } = await supabase
    .from("manuscript_style_rules")
    .select("*")
    .eq("manuscript_id", manuscriptId);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    category: r.category as StyleRule["category"],
    preferred: clean(r.preferred),
    variants: list(r.variants),
    note: clean(r.note),
    origin: r.origin === "detected" ? "detected" : "author",
    active: r.active !== false,
  }));
}

/**
 * What is already on the version, so no pass says it twice. A finding a
 * person dismissed counts as raised: it was decided not to be a problem.
 */
async function loadRaised(supabase: Sb["supabase"], versionId: string): Promise<Raised[]> {
  const { data } = await supabase
    .from("manuscript_findings")
    .select("title, category, source, chapter_keys, evidence, original, status")
    .eq("version_id", versionId)
    .neq("status", "resolved");
  return ((data ?? []) as Row[]).map((r) => {
    const evidence = (Array.isArray(r.evidence) ? r.evidence : []) as Row[];
    const quotes = evidence
      .filter((e) => typeof e?.quote === "string" && e.quote.trim())
      .map((e) => ({ nodeKey: String(e.nodeKey), text: String(e.quote) }));
    if (typeof r.original === "string" && r.original.trim() && evidence[0]?.nodeKey)
      quotes.push({ nodeKey: String(evidence[0].nodeKey), text: r.original });
    return {
      title: clean(r.title),
      category: clean(r.category),
      source: clean(r.source),
      chapterKeys: list(r.chapter_keys),
      quotes,
    };
  });
}

type NodeRow = {
  key: string;
  kind: string;
  number: string;
  label: string;
  text: string;
  chapter_key: string | null;
  ord: number;
};

async function loadChapterNodes(supabase: Sb["supabase"], versionId: string, chapterKey: string) {
  const out: NodeRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("manuscript_nodes")
      .select("key, kind, number, label, text, chapter_key, ord")
      .eq("version_id", versionId)
      .eq("chapter_key", chapterKey)
      .order("ord")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as NodeRow[]));
    if ((data ?? []).length < 1000) break;
  }
  // The chapter heading itself carries the chapter key as its own key.
  const { data: head } = await supabase
    .from("manuscript_nodes")
    .select("key, kind, number, label, text, chapter_key, ord")
    .eq("version_id", versionId)
    .eq("key", chapterKey)
    .maybeSingle();
  return head ? [head as NodeRow, ...out.filter((n) => n.key !== chapterKey)] : out;
}

/** Prose is read sentence by sentence; a heading, table or caption is one line. */
const SENTENCED = new Set(["front", "paragraph", "quote", "list_item", "footnote", "endnote"]);

/**
 * One atom as the model sees it. Prose is laid out a sentence per line, each
 * with its own key ("n29.2"), under its paragraph's key, so a finding can name
 * the sentence it is about and a quote is checked against that sentence alone.
 */
const render = (n: NodeRow) => {
  const kind = n.kind === "paragraph" ? "" : `(${n.kind}${n.number ? ` ${n.number}` : ""}) `;
  if (!SENTENCED.has(n.kind)) return `[${n.key}] ${kind}${n.text}`;
  const sentences = splitSentences(n.text);
  if (sentences.length <= 1) return `[${n.key}.1] ${kind}${n.text}`;
  return [
    `[${n.key}] ${kind}`.trimEnd(),
    ...sentences.map((x) => `  [${n.key}.${x.n}] ${x.text}`),
  ].join("\n");
};

/**
 * A key the model gave back, resolved against the atoms it was shown: the
 * paragraph, and the sentence if it named one that exists. A quote that is in
 * the paragraph but not the named sentence moves to the sentence it is in.
 */
function resolve(
  key: string,
  text: Map<string, string>,
  quote?: string,
): { nodeKey: string; sentence?: number; body: string; span: string } | null {
  const { nodeKey, sentence } = parseSentenceKey(key);
  const body = text.get(nodeKey);
  if (body === undefined) return null;
  const sentences = splitSentences(body);
  let n = sentence && sentences[sentence - 1] ? sentence : undefined;
  if (quote && n && !sentences[n - 1]!.text.includes(quote)) n = sentenceOf(body, quote);
  if (quote && !n) n = sentenceOf(body, quote);
  const span = n ? sentences[n - 1]!.text : body;
  return { nodeKey, ...(n ? { sentence: n } : {}), body, span };
}

/** How a fact is addressed to the model: its sentence where it has one. */
const factKey = (f: ChapterFact) => (f.sentence ? `${f.nodeKey}.${f.sentence}` : f.nodeKey);

/** Keep evidence that points at a real atom; keep a quote only if it is really there. */
function realEvidence(raw: unknown, text: Map<string, string>): Evidence[] {
  if (!Array.isArray(raw)) return [];
  const out: Evidence[] = [];
  for (const e of raw as Row[]) {
    const quote = clean(e?.quote);
    const at = resolve(clean(e?.nodeKey), text, quote || undefined);
    if (!at) continue;
    out.push({
      nodeKey: at.nodeKey,
      ...(at.sentence ? { sentence: at.sentence } : {}),
      ...(quote && at.span.includes(quote) ? { quote } : {}),
      ...(clean(e?.note) ? { note: clean(e?.note) } : {}),
    });
  }
  return out.slice(0, 12);
}

/* ---------------------------------------------------------- chapter review -- */

const summaryTool = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      description: "DESCRIPTIVE: what the chapter says. No evaluation here.",
      properties: {
        purpose: { type: "string" },
        summary: { type: "string", description: "Concise substantive summary, 80-180 words." },
        propositions: { type: "array", items: { type: "string" } },
        findings: { type: "array", items: { type: "string" } },
        evidence: {
          type: "array",
          items: { type: "string" },
          description: "Important evidence or authorities relied on.",
        },
        concepts: {
          type: "array",
          items: {
            type: "object",
            properties: { term: { type: "string" }, meaning: { type: "string" } },
            required: ["term", "meaning"],
          },
        },
        relationship: {
          type: "string",
          description: "Relationship to preceding and following chapters.",
        },
        contribution: { type: "string", description: "Contribution to the manuscript as a whole." },
        questionsAddressed: { type: "array", items: { type: "string" } },
        gaps: {
          type: "array",
          items: { type: "string" },
          description: "Apparent unresolved questions or gaps.",
        },
        facts: {
          type: "array",
          description:
            "Checkable facts other chapters will be compared against: dates, numbers, names, definitions, key claims and findings. Each tied to the atom it appears in. At most 40, the ones most likely to be restated elsewhere.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["date", "number", "name", "definition", "claim", "finding"],
              },
              subject: { type: "string" },
              value: { type: "string" },
              nodeKey: {
                type: "string",
                description: "The key of the sentence that states it, e.g. n29.2.",
              },
            },
            required: ["kind", "subject", "value", "nodeKey"],
          },
        },
      },
      required: ["purpose", "summary", "propositions", "facts"],
    },
    assessment: {
      type: "object",
      description: "EDITORIAL: how well the chapter does its job. Kept apart from the summary.",
      properties: {
        overall: { type: "string" },
        clarity: { type: "string" },
        structure: { type: "string" },
        coherence: { type: "string" },
        support: { type: "string", description: "Evidential support for its claims." },
        duplication: { type: "string" },
        roleInManuscript: { type: "string" },
      },
      required: ["overall"],
    },
    issues: {
      type: "array",
      description:
        "Editorial issues inside THIS chapter only: unsupported material assertions, contradictions within this chapter, structural problems, passages unclear enough to impede understanding. NOT proofreading, NOT conflicts with other chapters (a separate pass reads the chapters against each other), NOT cross-references, figure, table or heading numbering, NOT citation-bibliography matching (exact checks cover those). At most 10, most important first. Empty if there are none.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          category: {
            type: "string",
            enum: ["citation", "coherence", "clarity", "consistency"],
          },
          severity: {
            type: "string",
            enum: ["critical", "material", "minor"],
            description:
              "material: an unsupported statistic, date or empirical claim, or a contradiction the argument relies on; critical: it undermines the chapter's main conclusion; minor: everything else.",
          },
          action: { type: "string", enum: ["query", "suggestion"] },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nodeKey: {
                  type: "string",
                  description: "The key of the sentence (e.g. n29.2), or of the paragraph.",
                },
                quote: {
                  type: "string",
                  description: "Exact words from that sentence, 3-20 words.",
                },
                note: { type: "string" },
              },
              required: ["nodeKey"],
            },
          },
        },
        required: ["title", "body", "category", "severity", "action", "evidence"],
      },
    },
  },
  required: ["summary", "assessment", "issues"],
};

/**
 * Read one chapter whole: its summary, its assessment, its facts and its
 * chapter-level issues. The summary and assessment are written to the chapter;
 * the issues are returned for the caller to file with the rest.
 */
export const reviewChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { manuscriptId: string; versionId: string; chapterKey: string; context: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const nodes = await loadChapterNodes(supabase, data.versionId, data.chapterKey);
    const readable = nodes.filter((n) => n.kind !== "toc_entry");
    if (!readable.length) throw new Error("This chapter has no text to read.");
    const rules = await loadRules(supabase, data.manuscriptId);
    const text = new Map(readable.map((n) => [n.key, n.text]));
    const raised = (await loadRaised(supabase, data.versionId)).filter((r) =>
      r.chapterKeys.includes(data.chapterKey),
    );

    // A chapter past ~60,000 words is read in its first and last parts; the
    // summary says so rather than pretending to have read the middle.
    let body = readable.map(render).join("\n");
    let truncated = false;
    if (body.length > 400_000) {
      body = `${body.slice(0, 260_000)}\n[... middle of chapter omitted for length ...]\n${body.slice(-120_000)}`;
      truncated = true;
    }

    const out = await callStructured<Row>({
      feature: FEATURE,
      actor: { supabase, userId },
      system: EDITOR,
      user: [
        "Review this chapter as part of a larger manuscript.",
        "",
        "WHAT IS KNOWN ABOUT THE REST OF THE MANUSCRIPT:",
        data.context || "(Nothing yet: this is the first chapter read.)",
        "",
        "STYLE SHEET:",
        styleSheetText(rules),
        "",
        "ALREADY RAISED ON THIS CHAPTER (do not raise these again, in any wording):",
        raisedLines(raised),
        "",
        "Each atom is prefixed with its key in square brackets. Refer to atoms only by these keys.",
        "",
        "CHAPTER:",
        body,
      ].join("\n"),
      toolName: "record_chapter_review",
      toolDescription:
        "Record the descriptive summary, editorial assessment and chapter-level issues of one chapter.",
      parameters: summaryTool,
    });

    const s = (out.summary ?? {}) as Row;
    const facts: ChapterFact[] = (Array.isArray(s.facts) ? (s.facts as Row[]) : [])
      .map((f) => ({
        kind: oneOf(
          ["date", "number", "name", "definition", "claim", "finding"] as const,
          f.kind,
          "claim",
        ),
        subject: clean(f.subject),
        value: clean(f.value),
        ...(() => {
          const at = resolve(clean(f.nodeKey), text);
          return at
            ? { nodeKey: at.nodeKey, ...(at.sentence ? { sentence: at.sentence } : {}) }
            : { nodeKey: "" };
        })(),
      }))
      .filter((f) => f.subject && f.value && text.has(f.nodeKey))
      .slice(0, 40);
    const summary: ChapterSummary = {
      purpose: clean(s.purpose),
      summary:
        clean(s.summary) +
        (truncated ? " (The middle of this very long chapter was not read in full.)" : ""),
      propositions: list(s.propositions),
      findings: list(s.findings),
      evidence: list(s.evidence),
      concepts: (Array.isArray(s.concepts) ? (s.concepts as Row[]) : [])
        .map((c) => ({ term: clean(c.term), meaning: clean(c.meaning) }))
        .filter((c) => c.term),
      relationship: clean(s.relationship),
      contribution: clean(s.contribution),
      questionsAddressed: list(s.questionsAddressed),
      gaps: list(s.gaps),
      facts,
    };
    const a = (out.assessment ?? {}) as Row;
    const assessment: ChapterAssessment = {
      overall: clean(a.overall),
      clarity: clean(a.clarity),
      structure: clean(a.structure),
      coherence: clean(a.coherence),
      support: clean(a.support),
      duplication: clean(a.duplication),
      roleInManuscript: clean(a.roleInManuscript),
    };
    const { error } = await supabase
      .from("manuscript_chapters")
      .update({
        summary,
        assessment,
        summarised_at: new Date().toISOString(),
      })
      .eq("version_id", data.versionId)
      .eq("chapter_key", data.chapterKey);
    if (error) throw new Error(error.message);

    const findings: DraftFinding[] = [];
    for (const i of Array.isArray(out.issues) ? (out.issues as Row[]) : []) {
      const evidence = realEvidence(i.evidence, text);
      const title = clean(i.title);
      if (!title || !evidence.length) continue;
      const category = oneOf(
        ["citation", "coherence", "clarity", "consistency"] as const,
        i.category,
        "coherence",
      );
      const draft: DraftFinding = {
        pass: category === "citation" ? "citations" : "coherence",
        category,
        severity: oneOf(SEVERITIES, i.severity, "minor"),
        action: oneOf(["query", "suggestion"] as const, i.action, "query"),
        title,
        body: clean(i.body),
        evidence,
        fingerprint: fingerprint([
          "ai-chapter",
          category,
          title,
          evidence[0]?.quote ?? evidence[0]?.nodeKey,
        ]),
        source: "ai",
      };
      if (!repeats(draft, raised)) findings.push(draft);
    }
    return { summary, assessment, findings };
  });

/* ------------------------------------------------------------ proofreading -- */

const proofTool = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      description:
        "Language and mechanical problems in the passage. High precision: only real errors as corrections. Leave correct text alone even if you would phrase it differently.",
      items: {
        type: "object",
        properties: {
          nodeKey: {
            type: "string",
            description: "The key of the sentence the problem is in, e.g. n29.2.",
          },
          original: {
            type: "string",
            description:
              "The exact words as they stand in that sentence, copied character for character, with enough context (3-12 words) to be unique.",
          },
          replacement: {
            type: "string",
            description: "The same span corrected. Required for a correction; omit for a query.",
          },
          category: { type: "string", enum: ["error", "clarity", "style", "consistency", "query"] },
          action: { type: "string", enum: ["correction", "query", "suggestion"] },
          severity: { type: "string", enum: ["material", "minor"] },
          title: { type: "string", description: "Short label, e.g. 'Subject–verb agreement'." },
          body: {
            type: "string",
            description: "One sentence: what is wrong, or what the author must decide.",
          },
        },
        required: ["nodeKey", "original", "category", "action", "severity", "title", "body"],
      },
    },
  },
  required: ["findings"],
};

/** Words a style rule prefers must not be "corrected" into one of its variants. */
function breaksStyleSheet(original: string, replacement: string, rules: StyleRule[]) {
  const lower = (s: string) => s.toLowerCase();
  return rules.some(
    (r) =>
      r.active &&
      r.preferred &&
      lower(original).includes(lower(r.preferred)) &&
      r.variants.some((v) => v && lower(replacement).includes(lower(v))),
  );
}

/**
 * Proofread a run of atoms from one chapter. Returns only findings whose
 * `original` is really in the paragraph; everything else is discarded.
 */
export const proofreadPassage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      manuscriptId: string;
      versionId: string;
      nodeKeys: string[];
      chapterContext: string;
      /** Verification: report only on these sentences ("n29.2"); the rest is context. */
      onlySentences?: string[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: rows, error } = await supabase
      .from("manuscript_nodes")
      .select("key, kind, number, label, text, chapter_key, ord")
      .eq("version_id", data.versionId)
      .in("key", data.nodeKeys)
      .order("ord");
    if (error) throw new Error(error.message);
    const nodes = ((rows ?? []) as NodeRow[]).filter((n) => PROSE.has(n.kind) && n.text.trim());
    if (!nodes.length) return { findings: [] as DraftFinding[] };
    const rules = await loadRules(supabase, data.manuscriptId);
    const text = new Map(nodes.map((n) => [n.key, n.text]));
    const only = data.onlySentences?.length ? new Set(data.onlySentences) : null;
    const raised = (await loadRaised(supabase, data.versionId)).filter((r) =>
      r.quotes.some((q) => text.has(q.nodeKey)),
    );

    const out = await callStructured<Row>({
      feature: FEATURE,
      actor: { supabase, userId },
      system: EDITOR,
      user: [
        "Proofread and copyedit this passage. Report grammar, spelling, punctuation, agreement, repeated or missing words, wrong word, capitalisation and clear mechanical errors as corrections. Report a genuinely ambiguous or confusing sentence as a clarity suggestion. Report anything that departs from the style sheet as a style correction. Do not report stylistic preferences that the style sheet does not settle. Do not comment on heading or section numbering, cross-references to tables, figures or chapters, or citations: those are checked separately. Hyphenation of compounds, the serial comma and similar conventions are matters of style: raise them only where the style sheet settles them or where the choice changes the meaning.",
        "",
        "ALREADY RAISED IN THIS PASSAGE (do not report these again):",
        raisedLines(raised),
        "",
        "ABOUT THIS CHAPTER:",
        data.chapterContext || "(no summary yet)",
        "",
        "STYLE SHEET:",
        styleSheetText(rules),
        "",
        only
          ? `ONLY these sentences changed since the last version; report problems in them alone and treat the rest as context: ${[...only].join(", ")}`
          : "",
        "PASSAGE (each sentence prefixed with its key):",
        nodes.map(render).join("\n"),
      ].join("\n"),
      toolName: "record_proofreading",
      toolDescription: "Record proofreading findings for the passage.",
      parameters: proofTool,
    });

    const findings: DraftFinding[] = [];
    for (const f of Array.isArray(out.findings) ? (out.findings as Row[]) : []) {
      const original = typeof f.original === "string" ? f.original : "";
      if (!original.trim()) continue;
      const at = resolve(clean(f.nodeKey), text, original);
      // The words must be in the sentence named (or, failing that, found in
      // exactly one sentence of the paragraph); otherwise the finding is dropped.
      if (!at || !at.span.includes(original)) continue;
      const { nodeKey } = at;
      if (only && !(at.sentence && only.has(`${nodeKey}.${at.sentence}`))) continue;
      const replacement = typeof f.replacement === "string" ? f.replacement : "";
      let action = oneOf(ACTIONS, f.action, "suggestion");
      if (action === "correction" && (!replacement || replacement === original)) action = "query";
      if (action === "correction" && breaksStyleSheet(original, replacement, rules)) continue;
      const category = oneOf(CATEGORIES, f.category, "error");
      const pass: ReviewPass = category === "style" ? "style" : "mechanics";
      const draft: DraftFinding = {
        pass,
        category,
        severity: oneOf(["material", "minor"] as const, f.severity, "minor"),
        action,
        title: clean(f.title) || "Language",
        body: clean(f.body),
        ...(action === "correction" ? { original, replacement } : { original }),
        evidence: [{ nodeKey, ...(at.sentence ? { sentence: at.sentence } : {}), quote: original }],
        // The sentence, not the paragraph: an edit elsewhere in the paragraph
        // leaves this finding's identity alone.
        fingerprint: fingerprint(["ai-proof", hash(at.span), original, replacement]),
        source: "ai",
      };
      if (!repeats(draft, raised) && !findings.some((f) => repeats(draft, asRaised([f]))))
        findings.push(draft);
    }
    return { findings };
  });

/* ----------------------------------------------------------------- the map -- */

const mapTool = {
  type: "object",
  properties: {
    thesis: {
      type: "string",
      description: "The central thesis or proposition, in one or two sentences.",
    },
    researchQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string", description: "RQ1, RQ2…" }, text: { type: "string" } },
        required: ["id", "text"],
      },
    },
    objectives: { type: "array", items: { type: "string" } },
    methodology: { type: "string" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chapterKey: { type: "string" },
          role: { type: "string", description: "Its role in the argument, one sentence." },
          establishes: { type: "array", items: { type: "string" } },
          reliesOn: { type: "array", items: { type: "string" } },
          answers: {
            type: "array",
            items: { type: "string" },
            description: "Research question ids it answers.",
          },
        },
        required: ["chapterKey", "role"],
      },
    },
    issues: {
      type: "array",
      description:
        "Structural problems visible from the map only: a research question never answered, a conclusion that introduces an argument not developed earlier, a chapter relying on a proposition no earlier chapter establishes, a finding that never reaches the discussion or conclusion. Each tied to the chapters involved. Empty if there are none.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          severity: { type: "string", enum: ["critical", "material", "minor"] },
          chapterKeys: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body", "severity", "chapterKeys"],
      },
    },
  },
  required: ["thesis", "researchQuestions", "chapters", "issues"],
};

/**
 * The manuscript map, from the chapter summaries and the opening and closing
 * of the work. Written to the manuscript; structural issues are returned.
 */
export const mapManuscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      manuscriptId: string;
      versionId: string;
      targetChapterKeys: string[] | null;
      opening: string;
      closing: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const { data: chapterRows, error } = await supabase
      .from("manuscript_chapters")
      .select("chapter_key, number, title, summary, ord")
      .eq("version_id", data.versionId)
      .order("ord");
    if (error) throw new Error(error.message);
    const chapters = (chapterRows ?? []) as Row[];
    if (!chapters.length) throw new Error("No chapters were found to map.");
    const keys = new Set(chapters.map((c) => String(c.chapter_key)));
    const raised = (await loadRaised(supabase, data.versionId)).filter(
      (r) => r.chapterKeys.length > 1 || r.source === "ai",
    );

    const outline = chapters
      .map((c) => {
        const s = (c.summary ?? null) as ChapterSummary | null;
        return [
          `[${c.chapter_key}] ${[c.number, c.title].filter(Boolean).join(" ")}`,
          s
            ? `  purpose: ${s.purpose}\n  summary: ${s.summary}\n  propositions: ${s.propositions.join("; ")}\n  findings: ${s.findings.join("; ")}\n  questions addressed: ${s.questionsAddressed.join("; ")}`
            : "  (not yet summarised)",
        ].join("\n");
      })
      .join("\n\n");

    const out = await callStructured<Row>({
      feature: FEATURE,
      actor: { supabase, userId },
      system: EDITOR,
      user: [
        "Map how this manuscript's chapters build its argument. Use only chapter keys given below.",
        "",
        "ISSUES ALREADY RAISED (do not raise these again, in any wording):",
        raisedLines(raised),
        "",
        "OPENING OF THE MANUSCRIPT (abstract / introduction):",
        data.opening.slice(0, 24_000),
        "",
        "CLOSING OF THE MANUSCRIPT (conclusion):",
        data.closing.slice(0, 24_000),
        "",
        "CHAPTERS:",
        outline,
      ].join("\n"),
      toolName: "record_manuscript_map",
      toolDescription: "Record the manuscript map and any structural issues it reveals.",
      parameters: mapTool,
    });

    const map: ManuscriptMap = {
      thesis: clean(out.thesis),
      researchQuestions: (Array.isArray(out.researchQuestions)
        ? (out.researchQuestions as Row[])
        : []
      )
        .map((q) => ({ id: clean(q.id), text: clean(q.text) }))
        .filter((q) => q.id && q.text),
      objectives: list(out.objectives),
      methodology: clean(out.methodology),
      chapters: (Array.isArray(out.chapters) ? (out.chapters as Row[]) : [])
        .filter((c) => keys.has(clean(c.chapterKey)))
        .map((c) => ({
          chapterKey: clean(c.chapterKey),
          role: clean(c.role),
          establishes: list(c.establishes),
          reliesOn: list(c.reliesOn),
          answers: list(c.answers),
        })),
    };
    const { error: saveError } = await supabase
      .from("manuscripts")
      .update({ map, mapped_at: new Date().toISOString() })
      .eq("id", data.manuscriptId);
    if (saveError) throw new Error(saveError.message);

    const target = data.targetChapterKeys ? new Set(data.targetChapterKeys) : null;
    const findings: DraftFinding[] = [];
    for (const i of Array.isArray(out.issues) ? (out.issues as Row[]) : []) {
      const involved = list(i.chapterKeys).filter((k) => keys.has(k));
      const title = clean(i.title);
      if (!title || !involved.length) continue;
      if (target && !involved.some((k) => target.has(k))) continue;
      if (restates(title, involved, raised)) continue;
      findings.push({
        pass: "coherence",
        category: "coherence",
        severity: oneOf(SEVERITIES, i.severity, "material"),
        action: "query",
        title,
        body: clean(i.body),
        evidence: involved.map((k) => ({ nodeKey: k })),
        fingerprint: fingerprint(["ai-map", title, involved.sort().join(",")]),
        source: "ai",
      });
    }
    return { map, findings };
  });

/* ------------------------------------------------------- across chapters -- */

const crossTool = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      description:
        "Problems that only appear when chapters are read against each other. Each must cite the fact keys (atom keys) on both sides. Empty if none.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: {
            type: "string",
            description:
              "What each chapter says, why it may conflict, and what the author should decide. Say where they may be reconcilable.",
          },
          category: {
            type: "string",
            enum: ["consistency", "coherence", "citation", "cross_reference"],
          },
          severity: { type: "string", enum: ["critical", "material", "minor"] },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nodeKey: { type: "string", description: "A fact key, e.g. n81.2." },
                note: { type: "string" },
              },
              required: ["nodeKey"],
            },
          },
        },
        required: ["title", "body", "category", "severity", "evidence"],
      },
    },
  },
  required: ["findings"],
};

/**
 * Read the chapters against one another from their summaries and facts.
 * When target chapters are given, the whole manuscript is still the context,
 * but only findings touching a target chapter are kept: review scope is not
 * context scope.
 */
export const crossChapterReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { manuscriptId: string; versionId: string; targetChapterKeys: string[] | null }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Sb;
    const [{ data: chapterRows, error }, { data: m }] = await Promise.all([
      supabase
        .from("manuscript_chapters")
        .select("chapter_key, number, title, summary, ord")
        .eq("version_id", data.versionId)
        .order("ord"),
      supabase.from("manuscripts").select("map").eq("id", data.manuscriptId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const chapters = ((chapterRows ?? []) as Row[]).filter((c) => c.summary);
    if (chapters.length < 2) return { findings: [] as DraftFinding[] };
    const rules = await loadRules(supabase, data.manuscriptId);

    const factChapter = new Map<string, string>();
    const factValue = new Map<string, string>();
    const blocks = chapters.map((c) => {
      const s = c.summary as ChapterSummary;
      for (const f of s.facts ?? []) {
        // A fact is addressed by its sentence where it has one ("n81.2"), and
        // its paragraph key still resolves to the same chapter.
        factChapter.set(factKey(f), String(c.chapter_key));
        factChapter.set(f.nodeKey, String(c.chapter_key));
        factValue.set(factKey(f), f.value);
      }
      return [
        `CHAPTER [${c.chapter_key}] ${[c.number, c.title].filter(Boolean).join(" ")}`,
        `summary: ${s.summary}`,
        `propositions: ${s.propositions.join("; ")}`,
        `findings: ${(s.findings ?? []).join("; ")}`,
        `concepts: ${(s.concepts ?? []).map((k) => `${k.term} = ${k.meaning}`).join("; ")}`,
        "facts:",
        ...(s.facts ?? []).map((f) => `  - [${factKey(f)}] ${f.kind} | ${f.subject}: ${f.value}`),
      ].join("\n");
    });

    const target = data.targetChapterKeys ? new Set(data.targetChapterKeys) : null;
    const raised = (await loadRaised(supabase, data.versionId)).filter(
      (r) => r.chapterKeys.length > 1 || r.source === "ai",
    );
    const out = await callStructured<Row>({
      feature: FEATURE,
      actor: { supabase, userId },
      system: EDITOR,
      user: [
        "Read these chapters against one another and report cross-chapter problems: contradictory propositions or findings, the same fact (date, number, name) given differently, a term defined or used differently, terminology drift, duplicated discussion, an argument relied on before it is established, a research question that disappears, a finding that never reaches the discussion or conclusion, a conclusion not developed in the body, and inconsistent treatment of the same authority.",
        "Every finding must cite fact keys from at least two different chapters. Raise contradictions as questions for the author; never decide which side is right.",
        target
          ? `Only report problems that involve at least one of these chapters: ${[...target].join(", ")}. The others are context.`
          : "",
        "",
        "ISSUES ALREADY RAISED (do not raise these again, in any wording):",
        raisedLines(raised),
        "",
        "MANUSCRIPT MAP:",
        m?.map ? JSON.stringify(m.map).slice(0, 12_000) : "(not mapped yet)",
        "",
        "STYLE SHEET:",
        styleSheetText(rules),
        "",
        blocks.join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n"),
      toolName: "record_cross_chapter_findings",
      toolDescription: "Record problems found by reading chapters against each other.",
      parameters: crossTool,
    });

    const findings: DraftFinding[] = [];
    for (const f of Array.isArray(out.findings) ? (out.findings as Row[]) : []) {
      const evidence: Evidence[] = (Array.isArray(f.evidence) ? (f.evidence as Row[]) : [])
        .filter((e) => factChapter.has(clean(e.nodeKey)))
        .map((e) => {
          const key = clean(e.nodeKey);
          const { nodeKey, sentence } = parseSentenceKey(key);
          return {
            nodeKey,
            ...(sentence ? { sentence } : {}),
            note: clean(e.note) || factValue.get(key),
          };
        })
        .slice(0, 12);
      const involved = new Set(evidence.map((e) => factChapter.get(e.nodeKey)!));
      const title = clean(f.title);
      if (!title || involved.size < 2) continue;
      if (target && ![...involved].some((k) => target.has(k))) continue;
      if (restates(title, [...involved], raised)) continue;
      const category = oneOf(CATEGORIES, f.category, "consistency");
      findings.push({
        pass: category === "coherence" ? "coherence" : "consistency",
        category,
        severity: oneOf(SEVERITIES, f.severity, "material"),
        action: "query",
        title,
        body: clean(f.body),
        evidence,
        fingerprint: fingerprint([
          "ai-cross",
          title,
          evidence
            .map((e) => e.nodeKey)
            .sort()
            .join(","),
        ]),
        source: "ai",
      });
    }
    return { findings };
  });
