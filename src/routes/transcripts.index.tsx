import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import TranscriptsLibrary from "@/screens/TranscriptsLibrary";

const title = "Transcripts — Scripta";
const description =
  "Imported meeting transcripts with speakers, duration, source and the resolutions they produced.";

export const Route = createFileRoute("/transcripts/")({
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
      <TranscriptsLibrary />
    </Authed>
  ),
});
