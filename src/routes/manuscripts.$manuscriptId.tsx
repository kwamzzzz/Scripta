import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ManuscriptScreen, {
  MANUSCRIPT_TABS,
  type ManuscriptSearch,
  type ManuscriptTab,
} from "@/manuscripts/ManuscriptScreen";

const title = "Book Review — Scripta";
const description =
  "One manuscript under Book Review: its chapters, findings, style sheet, chapter map and versions.";

const text = (v: unknown) => (typeof v === "string" && v.length <= 80 ? v : undefined);

export const Route = createFileRoute("/manuscripts/$manuscriptId")({
  validateSearch: (search: Record<string, unknown>): ManuscriptSearch => ({
    tab: MANUSCRIPT_TABS.includes(search["tab"] as ManuscriptTab)
      ? (search["tab"] as ManuscriptTab)
      : undefined,
    chapter: text(search["chapter"]),
    node: text(search["node"]),
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
  const { manuscriptId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <Authed>
      <ManuscriptScreen manuscriptId={manuscriptId} search={search} />
    </Authed>
  );
}
