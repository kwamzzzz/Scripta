import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import DocumentsLibrary from "@/screens/DocumentsLibrary";

const title = "Documents — Scripta";
const description =
  "Every contract, amendment, transcript and playbook across all matters, with parse status and version.";

export const Route = createFileRoute("/documents")({
  validateSearch: (search: Record<string, unknown>) => ({
    upload: search["upload"] === true || search["upload"] === "true",
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
  component: () => (
    <Authed>
      <DocumentsLibrary />
    </Authed>
  ),
});
