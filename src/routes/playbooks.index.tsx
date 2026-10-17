import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PlaybooksLibrary from "@/screens/PlaybooksLibrary";

const title = "Playbooks — Scripta";
const description =
  "Workspace playbooks: positions, version, status, owner and the matters governed by each.";

export const Route = createFileRoute("/playbooks/")({
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
      <PlaybooksLibrary />
    </Authed>
  ),
});
