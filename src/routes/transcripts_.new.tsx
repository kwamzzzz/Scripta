import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import { DistillerIntake } from "@/wireframe/WorkspaceScreens";

const title = "New transcript — Scripta";
const description = "Upload or paste a meeting transcript to identify decisions and drafting instructions.";

export const Route = createFileRoute("/transcripts_/new")({
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
      <DistillerIntake />
    </Authed>
  ),
});
