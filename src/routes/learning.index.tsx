import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import LearningScreen from "@/screens/LearningScreen";

const title = "Learning — Scripta";
const description =
  "Structured legal training, your own reading discipline, and the CPD record both of them feed.";

/** Which entry of the Learning menu is open. Overview when absent. */
const validateSearch = (search: Record<string, unknown>): { view?: string } =>
  typeof search["view"] === "string" && search["view"] ? { view: search["view"] } : {};

export const Route = createFileRoute("/learning/")({
  validateSearch,
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
      <LearningScreen />
    </Authed>
  ),
});
