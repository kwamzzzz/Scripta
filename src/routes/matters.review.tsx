import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import MattersLibrary from "@/screens/MattersLibrary";

const title = "Contract Review — Scripta";
const description =
  "Matters with a contract to read: what changed, what is open and what has been decided.";

export const Route = createFileRoute("/matters/review")({
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
      <MattersLibrary mode="review" />
    </Authed>
  ),
});
