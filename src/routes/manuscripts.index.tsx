import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ManuscriptsScreen from "@/manuscripts/ManuscriptsScreen";

const title = "Manuscripts — Scripta";
const description =
  "Theses, dissertations, books and reports under Book Review: read chapter by chapter, checked as a whole.";

export const Route = createFileRoute("/manuscripts/")({
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
      <ManuscriptsScreen />
    </Authed>
  ),
});
