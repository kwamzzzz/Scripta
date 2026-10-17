import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PlaybookEditor from "@/screens/PlaybookEditor";

const title = "Playbook — Scripta";
const description = "Author the controlled positions a review is measured against.";

function PlaybookRoute() {
  const { playbookId } = Route.useParams();
  const { rule } = Route.useSearch();
  return (
    <Authed>
      <PlaybookEditor
        key={`${playbookId}:${rule ?? ""}`}
        playbookId={playbookId}
        {...(rule ? { initialRuleId: rule } : {})}
      />
    </Authed>
  );
}

export const Route = createFileRoute("/playbooks/$playbookId")({
  validateSearch: (search: Record<string, unknown>): { rule?: string } =>
    typeof search["rule"] === "string" ? { rule: search["rule"] } : {},
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: PlaybookRoute,
});
