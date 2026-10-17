import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import LibraryScreen from "@/library/LibraryScreen";

const title = "Library — Scripta";
const description =
  "The firm's research material: statutes, cases, books, articles, websites and guidance, grouped by collection, type, jurisdiction and topic.";

export const Route = createFileRoute("/library")({
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
      <LibraryScreen />
    </Authed>
  ),
});
