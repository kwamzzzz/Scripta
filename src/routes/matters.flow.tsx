import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import MatterFlowIndex from "@/matter-flow/MatterFlowIndex";

const title = "Flow — Scripta";
const description =
  "Every mandate's scope of services as phases, with deliverables, evidence and deadlines.";

export const Route = createFileRoute("/matters/flow")({
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
      <MatterFlowIndex />
    </Authed>
  ),
});
