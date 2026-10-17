import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import CorporateSetupScreen from "@/screens/CorporateSetupScreen";

const title = "New corporate document — Scripta";
const description =
  "Tell Scripta what corporate document you need and the circumstances; it lays out the structure.";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/matters/corporate-drafting_/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: string | undefined; matter?: string | undefined } => ({
    kind: str(search["kind"]),
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
  component: SetupRoute,
});

function SetupRoute() {
  const { kind, matter } = Route.useSearch();
  return (
    <Authed>
      <CorporateSetupScreen {...(kind ? { kind } : {})} {...(matter ? { matterId: matter } : {})} />
    </Authed>
  );
}
