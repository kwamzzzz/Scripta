import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ContractDraftingLibrary from "@/screens/ContractDraftingLibrary";

const title = "Contract Drafting — Scripta";
const description = "Plan, review and accept a fresh contract one clause at a time.";

export const Route = createFileRoute("/matters/contract-drafting")({
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
      <ContractDraftingLibrary />
    </Authed>
  ),
});
