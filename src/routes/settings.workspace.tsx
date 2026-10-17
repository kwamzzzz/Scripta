import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import WorkspaceSettingsScreen from "@/screens/WorkspaceSettingsScreen";

const title = "Firm settings — Scripta";
const description = "Firm name, members, invitations and paper for the selected workspace.";

export const Route = createFileRoute("/settings/workspace")({
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
      <WorkspaceSettingsScreen />
    </Authed>
  ),
});
