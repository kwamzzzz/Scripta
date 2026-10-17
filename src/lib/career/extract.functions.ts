/**
 * Breaking a job description into requirements that can be evidenced.
 *
 * Off by default, and deliberately: the wording of a requirement is the thing
 * a lawyer will later argue they meet, so the default is that they write it.
 * This exists because a long framework is forty requirements of typing, and
 * reading them off the page is exactly the kind of job a model is good at.
 *
 * WHAT IT MAY NOT DO. It may not invent a requirement that is not in the
 * text, may not smooth the firm's words into its own, and may not decide
 * whether the lawyer meets anything — the assessment is a pure function of
 * evidence and never goes near a model. Everything that comes back is
 * proposed, editable, and thrown away if the lawyer does not like it; the
 * original text is kept whatever happens to the extraction.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callStructured, GatewayError } from "@/lib/ai-gateway.server";

export type ExtractedCriterion = {
  kind: "responsibility" | "skill" | "competency" | "qualification" | "experience";
  section: string;
  text: string;
  essential: boolean;
};

const SYSTEM = [
  "You read job descriptions, role profiles and competency frameworks for a legal workbench.",
  "Your job is to split the document into the individual things a person could be assessed against, one at a time.",
  "Copy the employer's own wording. Do not paraphrase, summarise, merge two requirements into one, or split one requirement into several. If a bullet contains two distinct requirements joined by 'and', keep it as written unless they are plainly separate obligations.",
  "Never invent a requirement that is not in the text. If the document says nothing about qualifications, return none.",
  "Classify each one: responsibility (something the role does), skill (an ability), competency (a behaviour or professional quality), qualification (a formal credential), experience (a quantity or kind of prior work).",
  "Mark essential false only where the document itself calls it desirable, preferred, advantageous or nice to have.",
  "Keep the heading it sat under in the original as the section, where there is one.",
].join(" ");

const tool = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["responsibility", "skill", "competency", "qualification", "experience"],
          },
          section: { type: "string" },
          text: { type: "string" },
          essential: { type: "boolean" },
        },
        required: ["kind", "section", "text", "essential"],
      },
    },
  },
  required: ["criteria"],
};

export const extractCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string; title?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const text = (data.text ?? "").trim();
    if (text.length < 40)
      return {
        ok: false as const,
        error: "Paste the role's text first — there is too little here to read.",
      };

    try {
      const out = await callStructured<{ criteria: ExtractedCriterion[] }>({
        feature: "career-extract-criteria",
        actor: { supabase, userId },
        system: SYSTEM,
        user: [data.title ? `ROLE: ${data.title}` : "", "DOCUMENT:", text.slice(0, 24_000)]
          .filter(Boolean)
          .join("\n"),
        toolName: "role_criteria",
        toolDescription: "Return every requirement in the document, in the document's own words.",
        parameters: tool,
      });
      const criteria = (Array.isArray(out.criteria) ? out.criteria : [])
        .map((c) => ({
          kind: c.kind,
          section: (c.section ?? "").trim().slice(0, 120),
          text: (c.text ?? "").trim(),
          essential: c.essential !== false,
        }))
        .filter((c) => c.text.length > 2);
      return { ok: true as const, criteria };
    } catch (e) {
      return {
        ok: false as const,
        error:
          e instanceof GatewayError
            ? e.message
            : (e as Error).message || "Extraction is unavailable.",
      };
    }
  });
