import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import TemplateDetailScreen from "@/screens/TemplateDetailScreen";

const title = "Template — Scripta";
const description = "A document structure: its sections, in order, and the facts it asks for.";

export const Route = createFileRoute("/templates/$templateId")({
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
  component: RouteComponent,
});

function RouteComponent() {
  const { templateId } = Route.useParams();
  return (
    <Authed>
      <TemplateDetailScreen templateId={templateId} />
    </Authed>
  );
}
