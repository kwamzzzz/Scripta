import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ContractDraftingScreen from "@/screens/ContractDraftingScreen";

const title = "New contract — Scripta";
const description = "Describe, plan and draft a new contract.";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/matters/contract-drafting_/new")({
  validateSearch: (search: Record<string, unknown>): { matter?: string | undefined } => ({
    matter: str(search["matter"]),
  }),
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
  component: NewContractRoute,
});

function NewContractRoute() {
  const { matter } = Route.useSearch();
  return (
    <Authed>
      <ContractDraftingScreen matterId={matter} />
    </Authed>
  );
}
