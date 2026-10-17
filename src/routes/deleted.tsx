import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PutAsideScreen from "@/screens/PutAsideScreen";

const title = "Recently Deleted — Scripta";
const description =
  "Everything this workspace has deleted, kept for fifteen days before it is removed for good.";

export const Route = createFileRoute("/deleted")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <Authed>
      <PutAsideScreen state="deleted" />
    </Authed>
  ),
});
