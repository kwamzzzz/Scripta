import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PrecedentDetailScreen from "@/screens/PrecedentDetailScreen";

const title = "Precedent — Scripta";
const description = "An executed precedent: clauses, provenance and where it has been reused.";

export const Route = createFileRoute("/knowledge/$precedentId")({
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
  const { precedentId } = Route.useParams();
  return (
    <Authed>
      <PrecedentDetailScreen precedentId={precedentId} />
    </Authed>
  );
}
