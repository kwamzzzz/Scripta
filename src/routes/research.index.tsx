import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ResearchLibraryScreen from "@/research/ResearchLibraryScreen";

const title = "Research — Scripta";
const description = "Every research matter in the workspace, and where each one has got to.";

export const Route = createFileRoute("/research/")({
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
      <ResearchLibraryScreen />
    </Authed>
  ),
});
