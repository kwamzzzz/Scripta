import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ContractDraftingScreen from "@/screens/ContractDraftingScreen";

const title = "Contract draft — Scripta";
const description = "Continue a saved contract brief, clause plan or draft.";

export const Route = createFileRoute("/matters/contract-drafting_/$draftId")({
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
  const { draftId } = Route.useParams();
  return (
    <Authed>
      <ContractDraftingScreen draftId={draftId} />
    </Authed>
  );
}
