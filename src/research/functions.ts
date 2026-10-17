import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";
import { loadMatterContext } from "@/lib/matter-context.server";
import type { ResearchAuthority } from "@/lib/research.functions";

/**
 * The research workstation's model calls.
 *
 * Each one does a single step of the chain and hands the result back for the
 * lawyer to accept, edit or reject. Nothing here writes to the database: the
 * screens own the record, and the autosave puts it where it belongs. That is
 * deliberate — a model that could write straight into the record would make
 * the record something the lawyer has to police rather than something they own.
 *
 * The last call, `draftMemo`, is the important one architecturally: it drafts
 * only from the analysis and authorities already on the record. It is told, in
 * terms, that it may not introduce an authority that is not in front of it.
 * Research happens once, is checked once, and the drafting step cannot quietly
 * reopen it.
 */

const SHARED = [
  "You are a senior legal researcher inside Scripta, working for a practising lawyer in a law firm.",
  "This is internal professional work product. There is no client in the room: never address a client, never propose sending anything to a client, and never ask the lawyer to confirm something with their client as if that were a step in the tool.",
  "Be plain, specific and jurisdiction-aware. No hedging boilerplate, no restating the question back.",
  "Never invent an authority. If you are not confident a citation exists in that exact form, say so rather than producing it.",
].join(" ");

const fail = (e: unknown) => ({
  ok: false as const,
  error: e instanceof GatewayError ? e.message : (e as Error).message || "Scripta is unavailable.",
});

/* ------------------------------------------------------------- the brief -- */

export type DraftedQuestion = { short: string; question: string; priority: string; why: string };
export type DraftedBrief = {
  questions: DraftedQuestion[];
  plan: { legislation: string[]; caseLaw: string[]; secondary: string[]; themes: string[] };
  jurisdiction: string;
  areaOfLaw: string;
  outputKind: string;
  facts: { fact: string; classification: string }[];
};

const briefTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      description:
        "The legal questions the instructions and facts actually raise, in the order they should be answered.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          short: { type: "string", description: "A three to six word handle for the question." },
          question: {
            type: "string",
            description: "The question as a lawyer would frame it, ending in a question mark.",
          },
          priority: { type: "string", description: "High, Medium or Low." },
          why: {
            type: "string",
            description: "One sentence on why this question arises on these facts.",
          },
        },
        required: ["short", "question", "priority", "why"],
      },
    },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        legislation: {
          type: "array",
          items: { type: "string" },
          description: "Named statutes and codes to read.",
        },
        case_law: {
          type: "array",
          items: { type: "string" },
          description: "Named courts or lines of authority to search.",
        },
        secondary: {
          type: "array",
          items: { type: "string" },
          description: "Kinds of commentary worth consulting.",
        },
        themes: {
          type: "array",
          items: { type: "string" },
          description: "The specific points the research must settle.",
        },
      },
      required: ["legislation", "case_law", "secondary", "themes"],
    },
    jurisdiction: {
      type: "string",
      description: "The governing jurisdiction, inferred from the instructions. Empty if unclear.",
    },
    area_of_law: {
      type: "string",
      description: "The area of law, e.g. Contract law, Employment, Mining regulation.",
    },
    output_kind: {
      type: "string",
      description:
        "What is being produced: Research memorandum, Legal opinion, Client advice, Internal research note, Executive summary or Email advice.",
    },
    facts: {
      type: "array",
      description:
        "The factual record extracted from the narrative, one fact per entry. Empty when the lawyer already listed the facts.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fact: { type: "string" },
          classification: {
            type: "string",
            description: "Verified, Client-provided, Disputed, Assumed or Missing.",
          },
        },
        required: ["fact", "classification"],
      },
    },
  },
  required: ["questions", "plan", "jurisdiction", "area_of_law", "output_kind", "facts"],
};

/** Turn the lawyer's instructions and facts into a structured research assignment. */
export const draftBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      instructions: string;
      facts: string;
      jurisdiction: string;
      existingQuestions: string[];
      matterId?: string | null | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.instructions.trim() && !data.facts.trim())
      return { ok: false as const, error: "Write the instructions or the facts first." };
    let grounding = "";
    if (data.matterId) {
      try {
        grounding = (await loadMatterContext(supabase, data.matterId)).text;
      } catch {
        grounding = "";
      }
    }
    const prompt = [
      "INSTRUCTIONS FROM THE LAWYER:",
      data.instructions.trim() || "(none given)",
      "",
      "FACTS:",
      data.facts.trim() || "(none given)",
      data.jurisdiction ? `\nJURISDICTION THE LAWYER HAS SET: ${data.jurisdiction}` : "",
      data.existingQuestions.length
        ? `\nQUESTIONS ALREADY ON THE RECORD (do not repeat these):\n${data.existingQuestions.map((q) => `- ${q}`).join("\n")}`
        : "",
      grounding ? `\nMATTER CONTEXT:\n${grounding}` : "",
    ].join("\n");
    try {
      const out = await callStructured<{
        questions: DraftedQuestion[];
        plan: { legislation: string[]; case_law: string[]; secondary: string[]; themes: string[] };
        jurisdiction: string;
        area_of_law: string;
        output_kind: string;
        facts: { fact: string; classification: string }[];
      }>({
        feature: "research-brief",
        actor: { supabase, userId },
        system: [
          SHARED,
          "You are framing a research assignment. Read the instructions and the facts, and set out the legal questions that actually have to be answered — the questions presented — in the order a memorandum would take them.",
          "A question is a question of law applied to these facts, not a topic. Four to seven is usual; fewer if the instruction is narrow.",
          "Then propose where the research should look: named legislation, the courts whose decisions matter, the kinds of commentary, and the specific themes to settle.",
          "Where the lawyer gave a factual narrative rather than a list, break it into separate facts and classify each one. Where they already gave a list, return no facts.",
          "Infer the jurisdiction, the area of law and the output only where the material says so; leave them empty rather than guessing.",
        ].join(" "),
        user: prompt,
        toolName: "record_brief",
        toolDescription:
          "Record the questions presented, the research plan and what was inferred from the instructions.",
        parameters: briefTool,
      });
      const list = (v: unknown) =>
        Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
      return {
        ok: true as const,
        brief: {
          questions: (out.questions ?? [])
            .filter((q) => q?.question?.trim())
            .map((q) => ({
              short: q.short?.trim() || q.question.trim().slice(0, 48),
              question: q.question.trim(),
              priority: ["High", "Medium", "Low"].includes(q.priority) ? q.priority : "Medium",
              why: q.why?.trim() ?? "",
            })),
          plan: {
            legislation: list(out.plan?.legislation),
            caseLaw: list(out.plan?.case_law),
            secondary: list(out.plan?.secondary),
            themes: list(out.plan?.themes),
          },
          jurisdiction: out.jurisdiction?.trim() ?? "",
          areaOfLaw: out.area_of_law?.trim() ?? "",
          outputKind: out.output_kind?.trim() ?? "",
          facts: (out.facts ?? [])
            .filter((f) => f?.fact?.trim())
            .map((f) => ({
              fact: f.fact.trim(),
              classification: f.classification?.trim() || "Client-provided",
            })),
        } satisfies DraftedBrief,
      };
    } catch (e) {
      return fail(e);
    }
  });

/* -------------------------------------------------------- one question --- */

export type QuestionResearch = {
  answer: string;
  reasoning: string;
  confidence: string;
  findings: { text: string; cites: number[] }[];
  authorities: ResearchAuthority[];
};

const authorityProps = {
  n: { type: "integer", description: "Citation number, from 1, in the order first cited." },
  cite: { type: "string", description: "The citation as it would appear in a memorandum." },
  kind: {
    type: "string",
    description: "STATUTE, COURT DECISION, REGULATION, SECONDARY or UNVERIFIED.",
  },
  tier: { type: "string", description: "primary or secondary." },
  status: {
    type: "string",
    description:
      "current, repealed, superseded, or unverified. Say repealed or superseded where you know the provision has been replaced, even if it still appears in commentary.",
  },
  weight: { type: "string", description: "binding or persuasive in the jurisdiction researched." },
  source: {
    type: "string",
    description: "The court, legislature or publication, and its jurisdiction.",
  },
  date: { type: "string", description: "The date or year, or 'In force'." },
  held: { type: "string", description: "One sentence on what it holds or provides." },
  sections: {
    type: "array",
    description:
      "A reading summary: two to five sections, each with one to three short paragraphs in plain prose. Your summary, not a quotation.",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        paragraphs: { type: "array", items: { type: "string" } },
      },
      required: ["title", "paragraphs"],
    },
  },
};

const questionTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: {
      type: "string",
      description: "The provisional answer to this question, in two or three sentences.",
    },
    reasoning: {
      type: "string",
      description:
        "How the authorities lead to that answer. Two to four sentences. This is shown to the lawyer as your reasoning, not as their analysis.",
    },
    confidence: {
      type: "string",
      description:
        "well_supported, supported, limited, conflicting or unresolved. Use limited where the authority is thin, conflicting where authorities disagree, unresolved where the question cannot be answered on what you found.",
    },
    findings: {
      type: "array",
      description:
        "The propositions this question's answer rests on. Each cites its authorities by number.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          cites: { type: "array", items: { type: "integer" } },
        },
        required: ["text", "cites"],
      },
    },
    authorities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: authorityProps,
        required: [
          "n",
          "cite",
          "kind",
          "tier",
          "status",
          "weight",
          "source",
          "date",
          "held",
          "sections",
        ],
      },
    },
  },
  required: ["answer", "reasoning", "confidence", "findings", "authorities"],
};

/** Research one question presented, against the brief and the facts. */
export const researchQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      question: string;
      instructions: string;
      facts: string;
      jurisdiction: string;
      areaOfLaw: string;
      sources: string;
      since: string;
      lawAsAt: string;
      depth: string;
      plan: string;
      /** Citations already on the record, so new sources are numbered after them. */
      knownAuthorities: { n: number; cite: string }[];
      /** What the lawyer asked for on a re-run: contrary authority, stronger authority. */
      angle?: string | undefined;
      matterId?: string | null | undefined;
      researchId?: string | null | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.question.trim())
      return { ok: false as const, error: "This question has no text yet." };
    let grounding = "";
    if (data.matterId) {
      try {
        grounding = (await loadMatterContext(supabase, data.matterId)).text;
      } catch {
        grounding = "";
      }
    }
    const startAt = Math.max(0, ...data.knownAuthorities.map((a) => a.n)) + 1;
    const prompt = [
      data.instructions.trim() ? `INSTRUCTIONS:\n${data.instructions.trim()}\n` : "",
      data.facts.trim() ? `FACTS:\n${data.facts.trim()}\n` : "",
      `JURISDICTION: ${data.jurisdiction || "not stated"}`,
      data.areaOfLaw ? `AREA OF LAW: ${data.areaOfLaw}` : "",
      `SOURCE TYPES: ${data.sources}`,
      `AUTHORITIES SINCE: ${data.since}`,
      data.lawAsAt ? `LAW AS AT: ${data.lawAsAt}` : "",
      data.depth ? `DEPTH: ${data.depth}` : "",
      data.plan.trim() ? `\nRESEARCH PLAN:\n${data.plan.trim()}` : "",
      data.knownAuthorities.length
        ? `\nAUTHORITIES ALREADY ON THE RECORD — reuse these numbers where you rely on them, and number anything new from ${startAt}:\n${data.knownAuthorities.map((a) => `[${a.n}] ${a.cite}`).join("\n")}`
        : "",
      grounding ? `\nMATTER CONTEXT:\n${grounding}` : "",
      data.angle ? `\nTHE LAWYER ASKS SPECIFICALLY: ${data.angle}` : "",
      "",
      `QUESTION PRESENTED: ${data.question.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const out = await callStructured<{
        answer: string;
        reasoning: string;
        confidence: string;
        findings: { text: string; cites: number[] }[];
        authorities: (ResearchAuthority & { tier?: string; status?: string; weight?: string })[];
      }>({
        feature: "research-question",
        actor: { supabase, userId },
        system: [
          SHARED,
          "You are researching one question presented. Answer it provisionally, set out the propositions the answer rests on, and give the authorities behind them.",
          "Mark each authority honestly: primary or secondary, binding or persuasive, and above all whether it is current, repealed, superseded or something you could not verify. A repealed provision that still appears in commentary must be returned as repealed and must not carry the answer.",
          "Say how confident the conclusion is as a legal state, not a number. Where the authority is thin, say limited rather than dressing it up.",
          "Reading summaries are your own words and will be shown to the lawyer as AI summaries to be verified against the source.",
        ].join(" "),
        user: prompt,
        toolName: "record_question_research",
        toolDescription:
          "Record the provisional answer, the propositions and the authorities for one question presented.",
        parameters: questionTool,
      });
      const authorities = (out.authorities ?? [])
        .map((a, i) => ({
          n: Number(a.n) || startAt + i,
          cite: a.cite?.trim() || "Unnamed authority",
          kind: (a.kind || "UNVERIFIED").toUpperCase(),
          source: a.source || "",
          date: a.date || "",
          held: a.held || "",
          sections: Array.isArray(a.sections)
            ? a.sections
                .map((s) => ({
                  title: s.title || "Section",
                  paragraphs: (s.paragraphs ?? []).filter(Boolean),
                }))
                .filter((s) => s.paragraphs.length)
            : [],
          tier: (a.tier || "").toLowerCase(),
          status: (a.status || "").toLowerCase(),
          weight: (a.weight || "").toLowerCase(),
          addedBy: "ai",
          url: "",
          note: "",
          issueNos: "",
        }))
        .sort((a, b) => a.n - b.n);
      const known = new Set([
        ...authorities.map((a) => a.n),
        ...data.knownAuthorities.map((a) => a.n),
      ]);
      const confidences = ["well_supported", "supported", "limited", "conflicting", "unresolved"];
      return {
        ok: true as const,
        research: {
          answer: out.answer?.trim() || "",
          reasoning: out.reasoning?.trim() || "",
          confidence: confidences.includes(out.confidence) ? out.confidence : "limited",
          findings: (out.findings ?? [])
            .filter((f) => f.text?.trim())
            .map((f) => ({
              text: f.text.trim(),
              cites: (f.cites ?? []).filter((n) => known.has(n)),
            })),
          authorities,
        } satisfies QuestionResearch,
      };
    } catch (e) {
      return fail(e);
    }
  });

/* ---------------------------------------------------------- the analysis -- */

export type DraftedAnalysis = {
  rule: string;
  application: string;
  counterpoint: string;
  conclusion: string;
  confidence: string;
};

const analysisTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    rule: {
      type: "string",
      description:
        "What the law is on this question, drawn only from the authorities supplied. Two to five sentences.",
    },
    application: {
      type: "string",
      description: "How that law applies to these facts. Name the facts it turns on.",
    },
    counterpoint: {
      type: "string",
      description:
        "What weighs the other way: contrary authority, an argument the other side would run, or an assumption the conclusion depends on. Say 'None identified' only if there genuinely is none.",
    },
    conclusion: {
      type: "string",
      description:
        "The conclusion on this question, in one or two sentences, with any condition on it.",
    },
    confidence: {
      type: "string",
      description: "well_supported, supported, limited, conflicting or unresolved.",
    },
  },
  required: ["rule", "application", "counterpoint", "conclusion", "confidence"],
};

/** Write the analysis on one question, from the research already on the record. */
export const draftAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      question: string;
      answer: string;
      facts: string;
      jurisdiction: string;
      format: string;
      findings: { text: string; cites: number[] }[];
      authorities: { n: number; cite: string; kind: string; status: string; held: string }[];
      /** What the lawyer asked for: challenge this, make it more cautious. */
      angle?: string | undefined;
      /** Analysis already written, where this is a revision rather than a first draft. */
      existing?: DraftedAnalysis | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.authorities.length && !data.findings.length)
      return {
        ok: false as const,
        error: "Research this question before drafting the analysis on it.",
      };
    const prompt = [
      `QUESTION PRESENTED: ${data.question}`,
      data.answer ? `PROVISIONAL ANSWER FROM THE RESEARCH: ${data.answer}` : "",
      `JURISDICTION: ${data.jurisdiction || "not stated"}`,
      `ANALYTICAL FORMAT: ${data.format}`,
      data.facts.trim() ? `\nFACTS:\n${data.facts.trim()}` : "",
      "",
      "PROPOSITIONS ESTABLISHED BY THE RESEARCH:",
      data.findings.map((f) => `- ${f.text} [${f.cites.join(", ")}]`).join("\n") || "(none)",
      "",
      "AUTHORITIES AVAILABLE — you may not cite anything else:",
      data.authorities
        .map((a) => `[${a.n}] ${a.cite} · ${a.kind}${a.status ? ` · ${a.status}` : ""} — ${a.held}`)
        .join("\n") || "(none)",
      data.existing
        ? `\nANALYSIS ALREADY WRITTEN, which you are revising:\nRULE: ${data.existing.rule}\nAPPLICATION: ${data.existing.application}\nCOUNTERPOINT: ${data.existing.counterpoint}\nCONCLUSION: ${data.existing.conclusion}`
        : "",
      data.angle ? `\nTHE LAWYER ASKS: ${data.angle}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const out = await callStructured<DraftedAnalysis>({
        feature: "research-analysis",
        actor: { supabase, userId },
        system: [
          SHARED,
          "You are writing the analysis on one question presented: the rule, its application to the facts, what weighs against it, and the conclusion.",
          "You may rely only on the authorities supplied. If the analysis needs something that is not there, say so in the counterpoint rather than citing something you have not been given.",
          "An authority marked repealed or superseded may be mentioned as history but must not carry the conclusion.",
          "Write as the lawyer would: no headings inside a part, no bullet lists, no restating the question.",
        ].join(" "),
        user: prompt,
        toolName: "record_analysis",
        toolDescription: "Record the analysis on one question presented.",
        parameters: analysisTool,
      });
      const confidences = ["well_supported", "supported", "limited", "conflicting", "unresolved"];
      return {
        ok: true as const,
        analysis: {
          rule: out.rule?.trim() ?? "",
          application: out.application?.trim() ?? "",
          counterpoint: out.counterpoint?.trim() ?? "",
          conclusion: out.conclusion?.trim() ?? "",
          confidence: confidences.includes(out.confidence) ? out.confidence : "supported",
        } satisfies DraftedAnalysis,
      };
    } catch (e) {
      return fail(e);
    }
  });

/* --------------------------------------------------------------- the memo -- */

export type DraftedMemo = {
  title: string;
  intro: string;
  sections: { title: string; body: string; cites: number[] }[];
};

const memoTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    intro: {
      type: "string",
      description:
        "The opening: the matter, the parties and what is asked, in two or three sentences.",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          body: {
            type: "string",
            description:
              "The section's prose. Paragraphs separated by a blank line. No markdown, no bullet characters.",
          },
          cites: {
            type: "array",
            items: { type: "integer" },
            description: "The authority numbers this section relies on.",
          },
        },
        required: ["title", "body", "cites"],
      },
    },
  },
  required: ["title", "intro", "sections"],
};

/**
 * Draft the document from the research record.
 *
 * This call is given the analysis and the authorities and nothing else. It is
 * a writing step, not a research step: the chain is facts → questions →
 * sources → propositions → analysis → draft, and re-researching here would
 * reopen at the last moment everything the lawyer has already checked.
 */
export const draftMemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      outputKind: string;
      title: string;
      instructions: string;
      facts: string;
      assumptions: string;
      jurisdiction: string;
      lawAsAt: string;
      questions: {
        no: string;
        short: string;
        question: string;
        rule: string;
        application: string;
        counterpoint: string;
        conclusion: string;
        confidence: string;
      }[];
      authorities: { n: number; cite: string; kind: string; status: string; held: string }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.questions.length)
      return { ok: false as const, error: "There are no questions with analysis to draft from." };
    const prompt = [
      `DOCUMENT TO PRODUCE: ${data.outputKind || "Research memorandum"}`,
      `WORKING TITLE: ${data.title || "(untitled)"}`,
      `JURISDICTION: ${data.jurisdiction || "not stated"}`,
      data.lawAsAt ? `LAW AS AT: ${data.lawAsAt}` : "",
      data.instructions.trim() ? `\nINSTRUCTIONS:\n${data.instructions.trim()}` : "",
      data.facts.trim() ? `\nFACTS:\n${data.facts.trim()}` : "",
      data.assumptions.trim() ? `\nASSUMPTIONS:\n${data.assumptions.trim()}` : "",
      "",
      "THE ANALYSIS, QUESTION BY QUESTION. This is the whole of what you may say:",
      data.questions
        .map((q) =>
          [
            `${q.no} ${q.short || q.question}`,
            `QUESTION: ${q.question}`,
            q.rule ? `RULE: ${q.rule}` : "",
            q.application ? `APPLICATION: ${q.application}` : "",
            q.counterpoint ? `COUNTERPOINT: ${q.counterpoint}` : "",
            q.conclusion ? `CONCLUSION: ${q.conclusion}` : "",
            q.confidence ? `CONFIDENCE: ${q.confidence.replace(/_/g, " ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n"),
      "",
      "AUTHORITIES ON THE RECORD — cite by number, and cite nothing else:",
      data.authorities
        .map((a) => `[${a.n}] ${a.cite} · ${a.kind}${a.status ? ` · ${a.status}` : ""} — ${a.held}`)
        .join("\n") || "(none)",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const out = await callStructured<DraftedMemo>({
        feature: "research-memo",
        actor: { supabase, userId },
        system: [
          SHARED,
          "You are writing the document from a research record that has already been made and checked. You are not researching.",
          "You may state only what the analysis states and cite only the authorities listed. You may not add an authority, a proposition or a conclusion that is not in front of you. If the analysis does not reach something the instructions asked for, say so in the document rather than filling the gap.",
          "Structure it as the document type requires: a memorandum runs executive summary, questions presented, short answers, facts, applicable law, analysis question by question, conclusion and recommendations. Shorter forms drop what they do not need.",
          "Where a conclusion rests on limited or conflicting authority, the document must say so in its own words.",
          "Plain professional prose. No markdown, no bullet characters, no headings inside a section body.",
        ].join(" "),
        user: prompt,
        toolName: "record_memo",
        toolDescription: "Record the drafted document, section by section.",
        parameters: memoTool,
      });
      const known = new Set(data.authorities.map((a) => a.n));
      return {
        ok: true as const,
        memo: {
          title: out.title?.trim() || data.title,
          intro: out.intro?.trim() ?? "",
          sections: (out.sections ?? [])
            .filter((s) => s.title?.trim() || s.body?.trim())
            .map((s) => ({
              title: s.title?.trim() ?? "",
              body: s.body?.trim() ?? "",
              cites: (s.cites ?? []).filter((n) => known.has(n)),
            })),
        } satisfies DraftedMemo,
      };
    } catch (e) {
      return fail(e);
    }
  });

/* -------------------------------------------------------------- the review -- */

export type ReviewNote = { area: string; severity: string; title: string; detail: string };

const reviewTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string", description: "scope, authority, facts, citation or drafting." },
          severity: {
            type: "string",
            description:
              "open where it must be dealt with before the document leaves; warn where it is worth a look.",
          },
          title: { type: "string", description: "The problem in under ten words." },
          detail: {
            type: "string",
            description:
              "What is wrong and what would fix it. One or two sentences. Quote the words at issue where that helps.",
          },
        },
        required: ["area", "severity", "title", "detail"],
      },
    },
  },
  required: ["notes"],
};

/** Read the drafted document back against the record it was drafted from. */
export const reviewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      draft: string;
      instructions: string;
      facts: string;
      questions: { no: string; question: string; conclusion: string; confidence: string }[];
      authorities: { n: number; cite: string; kind: string; status: string }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (!data.draft.trim())
      return { ok: false as const, error: "There is no draft to review yet." };
    const prompt = [
      "THE DRAFT:",
      data.draft.trim(),
      "",
      "WHAT WAS ASKED:",
      data.instructions.trim() || "(no instructions recorded)",
      "",
      "THE FACTUAL RECORD:",
      data.facts.trim() || "(no facts recorded)",
      "",
      "THE QUESTIONS AND THEIR CONCLUSIONS:",
      data.questions
        .map(
          (q) =>
            `${q.no} ${q.question}\n  conclusion: ${q.conclusion || "(none)"} [${q.confidence || "not assessed"}]`,
        )
        .join("\n") || "(none)",
      "",
      "AUTHORITIES ON THE RECORD:",
      data.authorities
        .map((a) => `[${a.n}] ${a.cite} · ${a.kind}${a.status ? ` · ${a.status}` : ""}`)
        .join("\n") || "(none)",
    ].join("\n");
    try {
      const out = await callStructured<{ notes: ReviewNote[] }>({
        feature: "research-review",
        actor: { supabase, userId },
        system: [
          SHARED,
          "You are checking a drafted document against the record it was drafted from, as a careful colleague would before it goes out.",
          "Look for: propositions of law stated without authority; figures, dates, names or amounts in the draft that contradict the factual record; anything the instructions asked for that the draft does not address; reliance on a source marked repealed, superseded or unverified; conclusions stated more absolutely than the recorded confidence supports; and drafting faults — inconsistent party names, undefined terms, repetition.",
          "Report only what is actually wrong. An empty list is a good answer. Do not invent problems to appear thorough, and do not restate what the document does well.",
        ].join(" "),
        user: prompt,
        toolName: "record_review",
        toolDescription: "Record what a careful reader would raise on this draft.",
        parameters: reviewTool,
      });
      return {
        ok: true as const,
        notes: (out.notes ?? [])
          .filter((n) => n.title?.trim())
          .map((n) => ({
            area: ["scope", "authority", "facts", "citation", "drafting"].includes(n.area)
              ? n.area
              : "drafting",
            severity: n.severity === "open" ? "open" : "warn",
            title: n.title.trim(),
            detail: n.detail?.trim() ?? "",
          })),
      };
    } catch (e) {
      return fail(e);
    }
  });
