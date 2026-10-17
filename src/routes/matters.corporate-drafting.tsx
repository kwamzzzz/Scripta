import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import CorporateDraftingLibrary from "@/screens/CorporateDraftingLibrary";

const title = "Corporate Drafting — Scripta";
const description = "Prepare board resolutions and letters on the firm's chosen letterhead.";

export const Route = createFileRoute("/matters/corporate-drafting")({
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
      <CorporateDraftingLibrary />
    </Authed>
  ),
});
