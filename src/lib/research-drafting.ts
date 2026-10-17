import type { GuidanceStep } from "@/lib/drafting";
import { authorityLabel, authorityWeight, UNVERIFIED_NOTE } from "@/lib/authority";

export type DraftingResearchAuthority = {
  n: number;
  cite: string;
  kind: string;
  source: string;
  date: string;
  held: string;
};

export type DraftingResearchSource = {
  id: string;
  title: string;
  shortAnswer: string;
  authorities: DraftingResearchAuthority[];
};

/**
 * Carry a completed research conclusion into the visible drafting chain.
 * The memo never becomes clause text: it remains AI-labelled context that a
 * lawyer can inspect while writing the new words themselves.
 */
export function researchGuidance(source: DraftingResearchSource): GuidanceStep[] {
  const shortAnswer = source.shortAnswer.trim();
  if (!shortAnswer) return [];

  const authorities = [...source.authorities]
    .sort((a, b) => a.n - b.n)
    .filter((authority) => authority.cite.trim())
    .map((authority) => {
      const weight = authorityWeight(authority.kind);
      const identity = [
        authorityLabel(authority.kind),
        authority.source.trim(),
        authority.date.trim(),
      ]
        .filter(Boolean)
        .join(" · ");
      return [
        `[${authority.n}] ${authority.cite.trim()}${identity ? ` — ${identity}` : ""}`,
        weight === "unverified" ? UNVERIFIED_NOTE : null,
        authority.held.trim(),
      ]
        .filter((part): part is string => Boolean(part))
        .join("\n");
    });

  return [
    {
      label: `Research conclusion — ${source.title.trim() || "Untitled research"}`,
      body: [
        `Short answer\n${shortAnswer}`,
        authorities.length ? `Authorities relied on\n${authorities.join("\n\n")}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join("\n\n"),
      source: "ai",
    },
  ];
}
