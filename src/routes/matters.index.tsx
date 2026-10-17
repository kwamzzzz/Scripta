import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import MattersLibrary from "@/screens/MattersLibrary";

const title = "Matters — Scripta";
const description =
  "Every piece of work in the workspace: stage, risk, open items, playbook and owner, in one dense library.";

export const Route = createFileRoute("/matters/")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean | undefined } => ({
    new:
      search["new"] === true || search["new"] === "true" || search["new"] === 1 ? true : undefined,
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
  component: MattersRoute,
});

function MattersRoute() {
  const search = Route.useSearch();
  return (
    <Authed>
      <MattersLibrary mode="matters" startNew={!!search.new} />
    </Authed>
  );
}
