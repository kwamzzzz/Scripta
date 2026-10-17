import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import FeedbackScreen from "@/screens/FeedbackScreen";

const title = "Feedback — Scripta";
const description = "Feedback sent by members of this workspace, for its owner and administrators.";

export const Route = createFileRoute("/settings/feedback")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // Nothing here should be indexed or linked to: it is one workspace's
      // private correspondence about the product.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Authed>
      <FeedbackScreen />
    </Authed>
  ),
});
