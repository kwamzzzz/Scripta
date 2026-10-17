import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import TemplatesScreen from "@/screens/TemplatesScreen";

const title = "Templates — Scripta";
const description = "Reusable document structures: the sections a draft starts from.";

export const Route = createFileRoute("/templates/")({
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
      <TemplatesScreen />
    </Authed>
  ),
});
