import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PlaybookSetupScreen from "@/screens/PlaybookSetupScreen";

const title = "New playbook — Scripta";
const description =
  "Teach Scripta how you approach a kind of contract: the issues that matter and where you stand on each.";

export const Route = createFileRoute("/playbooks_/new")({
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
  component: () => (
    <Authed>
      <PlaybookSetupScreen />
    </Authed>
  ),
});
