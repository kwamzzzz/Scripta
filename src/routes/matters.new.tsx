import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import IntakeScreen from "@/screens/IntakeScreen";

const title = "New matter — Scripta";
const description =
  "Guided intake: matter details, the whole document set at once, and the review pairing.";

export const Route = createFileRoute("/matters/new")({
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
      <IntakeScreen />
    </Authed>
  ),
});
