import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import AdminScreen from "@/screens/AdminScreen";

const title = "Admin portal — Scripta";
const description =
  "Control over Scripta: features, feedback, people, AI usage, announcements and the activity log.";

export const Route = createFileRoute("/admin")({
  // Which tab is open, so a link can land on the right one.
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search["tab"] === "string" ? { tab: search["tab"] } : {},
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
      <AdminScreen />
    </Authed>
  ),
});
