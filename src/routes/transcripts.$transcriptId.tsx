import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import DistillerScreen from "@/screens/transcripts/DistillerScreen";

const title = "Distiller workspace — Scripta";
const description =
  "What a meeting established: decisions, commitments, positions and open points, each traced to where it was said.";

export const Route = createFileRoute("/transcripts/$transcriptId")({
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
  component: Screen,
});

function Screen() {
  const { transcriptId } = Route.useParams();
  return (
    <Authed>
      <DistillerScreen transcriptId={transcriptId} />
    </Authed>
  );
}
