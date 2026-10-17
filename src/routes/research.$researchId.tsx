import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ResearchWorkstation, {
  RESEARCH_TABS,
  type ResearchTabKey,
} from "@/research/ResearchWorkstation";

const title = "Research matter — Scripta";
const description =
  "One research matter: the brief, the research behind each question, the analysis, the document and its sources.";

const KEYS = RESEARCH_TABS.map((t) => t.id);

export const Route = createFileRoute("/research/$researchId")({
  validateSearch: (search: Record<string, unknown>): { tab?: ResearchTabKey | undefined } => ({
    tab: KEYS.includes(search["tab"] as ResearchTabKey)
      ? (search["tab"] as ResearchTabKey)
      : undefined,
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
  component: Screen,
});

function Screen() {
  const { researchId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Authed>
      <ResearchWorkstation
        researchId={researchId}
        tab={tab ?? "brief"}
        onTab={(next) => void navigate({ search: { tab: next } })}
      />
    </Authed>
  );
}
