import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ResearchIntake from "@/research/ResearchIntake";

const title = "New research — Scripta";
const description = "Start a research matter from the instruction and the facts.";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/research/new")({
  validateSearch: (search: Record<string, unknown>): { matter?: string | undefined } => ({
    matter: str(search["matter"]),
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewResearchRoute,
});

function NewResearchRoute() {
  const { matter } = Route.useSearch();
  return (
    <Authed>
      <ResearchIntake {...(matter ? { matterId: matter } : {})} />
    </Authed>
  );
}
