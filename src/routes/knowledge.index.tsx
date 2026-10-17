import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import KnowledgeScreen from "@/screens/KnowledgeScreen";

const title = "Precedents — Scripta";
const description =
  "Approved clause language, reusable across matters by clause type, agreement type and jurisdiction.";

export const Route = createFileRoute("/knowledge/")({
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
      <KnowledgeScreen />
    </Authed>
  ),
});
