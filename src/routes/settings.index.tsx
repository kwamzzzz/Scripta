import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import SettingsScreen from "@/screens/SettingsScreen";

const title = "Settings — Scripta";
const description =
  "Account, workspace and member settings for the Scripta contract-review workbench.";

export const Route = createFileRoute("/settings/")({
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
      <SettingsScreen />
    </Authed>
  ),
});
