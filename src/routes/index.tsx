import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import { Dashboard } from "@/wireframe/WorkspaceScreens";

const title = "Scripta — Contract Review Workbench";
const description =
  "Scripta: a legal contract-review workbench linking playbook positions, clause-level diffs, meeting resolutions and drafting points.";

export const Route = createFileRoute("/")({
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
      <Dashboard />
    </Authed>
  ),
});
