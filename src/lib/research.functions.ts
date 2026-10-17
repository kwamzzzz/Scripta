import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";
import { loadMatterContext } from "@/lib/matter-context.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ResearchAuthority = {
  n: number;
  cite: string;
  kind: string;
  source: string;
  date: string;
  held: string;
  sections: { title: string; paragraphs: string[] }[];
  /** Primary or secondary. What weight this source carries as a source. */
  tier?: string;
  /** Current, repealed, superseded or unverified. Whether it can be relied on. */
  status?: string;
  /** Binding or persuasive in the jurisdiction researched. */
  weight?: string;
  /** "ai" for something the model proposed, "lawyer" for something you added. */
  addedBy?: string;
  url?: string;
  /** Your own note on the source: what it is good for, what it does not reach. */
  note?: string;
  /** The question numbers this source is used in, comma-separated. */
  issueNos?: string;
};
/** One proposition the research established, and the authorities behind it. */
export type ResearchFinding = { text: string; cites: number[]; issueNo?: string };
export type ResearchAnswer = {
  shortAnswer: string;
  findings: ResearchFinding[];
  authorities: ResearchAuthority[];
};

const RESEARCH_SYSTEM = [
  "You are a senior legal researcher inside Scripta, answering a practising lawyer's question for the jurisdiction and source types requested.",
  "Answer first: a short answer in two or three sentences, then findings, then the authorities relied on. Every finding cites one or more authorities by number. Authorities are numbered from 1 in the order first cited.",
  "Only cite authorities you are confident exist under that exact citation: statutes by article or section, decisions by their reported reference, regulations and reputable secondary sources. If you are not confident, do not invent one; set kind to UNVERIFIED and say so in the held summary.",
  "For each authority give: kind (STATUTE, COURT DECISION, REGULATION, SECONDARY or UNVERIFIED), the court or source and jurisdiction, the date or year, one sentence on what it holds or provides, and a reading summary of two to five sections (for a decision: Facts, Procedural history, Considerations, Holding; for a statute: the relevant provisions), each with one to three short paragraphs in plain prose. These summaries are yours, not quotations, and will be labelled as AI summaries to be verified against the source.",
  "Where INSTRUCTIONS are given, they are the lawyer's own and govern: answer for the audience and purpose they state, respect anything they put out of scope, and if they ask for something the question does not cover, say so in the short answer rather than ignoring it.",
  "Plain, specific, jurisdiction-aware. No hedging boilerplate. Where the law is uncertain or has changed recently, say so in the short answer.",
].join(" ");

const researchTool = {
  type: "object",
  additionalProperties: false,
  properties: {
    short_answer: { type: "string" },
    findings: {
      type: "array",
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
        properties: {
          n: { type: "integer" },
          cite: { type: "string" },
          kind: { type: "string" },
          source: { type: "string" },
          date: { type: "string" },
          held: { type: "string" },
          sections: {
            type: "array",
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
        },
        required: ["n", "cite", "kind", "source", "date", "held", "sections"],
      },
    },
  },
  required: ["short_answer", "findings", "authorities"],
};

/**
 * The user half of a research call, assembled in one place so what reaches the
 * model can be tested. The lawyer's instructions lead: they say what the answer
 * is for and what is out of scope, which a bare question rarely does. Empty
 * parts are dropped rather than sent as blank headings.
 */
export function researchPrompt(input: {
  instructions: string;
  jurisdiction: string;
  sources: string;
  since: string;
  grounding: string;
  question: string;
}): string {
  const instructions = input.instructions.trim();
  return [
    ...(instructions ? [`INSTRUCTIONS:\n${instructions}\n`] : []),
    `JURISDICTION: ${input.jurisdiction}`,
    `SOURCE TYPES: ${input.sources}`,
    `AUTHORITIES SINCE: ${input.since}`,
    input.grounding ? `\nMATTER CONTEXT:\n${input.grounding}` : "",
    "",
    `QUESTION: ${input.question}`,
  ].join("\n");
}

/** Wireframe 4a: one structured research call. Nothing is stored server-side yet. */
export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      question: string;
      jurisdiction: string;
      sources: string;
      since: string;
      matterId?: string | null | undefined;
      researchId?: string | null | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const question = data.question.trim();
    if (!question) return { ok: false as const, error: "Type a research question first." };
    // The lawyer's own instructions lead the prompt: they say what the answer
    // is for and what is out of scope, which the question alone rarely does.
    let instructions = "";
    if (data.researchId) {
      const { data: row } = await supabase
        .from("research_matters")
        .select("instructions")
        .eq("id", data.researchId)
        .maybeSingle();
      instructions = (row?.instructions ?? "").trim();
    }
    let grounding = "";
    if (data.matterId) {
      try {
        grounding = (await loadMatterContext(supabase, data.matterId)).text;
      } catch {
        grounding = "";
      }
    }
    const prompt = researchPrompt({
      instructions,
      jurisdiction: data.jurisdiction,
      sources: data.sources,
      since: data.since,
      grounding,
      question,
    });
    try {
      const out = await callStructured<{
        short_answer: string;
        findings: { text: string; cites: number[] }[];
        authorities: ResearchAuthority[];
      }>({
        feature: "research",
        actor: { supabase, userId },
        system: RESEARCH_SYSTEM,
        user: prompt,
        toolName: "record_research",
        toolDescription: "Record the answer, findings and authorities for a research question.",
        parameters: researchTool,
      });
      const authorities = (out.authorities ?? [])
        .map((a, i) => ({
          n: Number(a.n) || i + 1,
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
        }))
        .sort((a, b) => a.n - b.n);
      const known = new Set(authorities.map((a) => a.n));
      const answer: ResearchAnswer = {
        shortAnswer: out.short_answer?.trim() || "",
        findings: (out.findings ?? [])
          .filter((f) => f.text?.trim())
          .map((f) => ({
            text: f.text.trim(),
            cites: (f.cites ?? []).filter((n) => known.has(n)),
          })),
        authorities,
      };
      return { ok: true as const, answer };
    } catch (e) {
      return {
        ok: false as const,
        error:
          e instanceof GatewayError
            ? e.message
            : (e as Error).message || "Research is unavailable.",
      };
    }
  });
