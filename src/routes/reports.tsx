import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import WorkReportScreen from "@/screens/WorkReportScreen";

const title = "Daily Work Report — Scripta";
const description =
  "What you completed today and what it produced, compiled from work already recorded.";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Authed>
      <WorkReportScreen />
    </Authed>
  ),
});
