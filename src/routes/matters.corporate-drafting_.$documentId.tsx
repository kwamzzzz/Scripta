import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import CorporateDraftingScreen from "@/screens/CorporateDraftingScreen";

const title = "Corporate document — Scripta";
const description = "Write a board resolution or letter on the firm's paper.";

// The trailing underscore keeps the editor out from under the library route.
export const Route = createFileRoute("/matters/corporate-drafting_/$documentId")({
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
  const { documentId } = Route.useParams();
  return (
    <Authed>
      <CorporateDraftingScreen documentId={documentId} />
    </Authed>
  );
}
