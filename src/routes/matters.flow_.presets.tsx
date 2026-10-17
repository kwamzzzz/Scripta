import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PresetsLibrary from "@/matter-flow/presets/PresetsLibrary";

const title = "Presets — Scripta";
const description =
  "Reusable matter structures: the phases a kind of work moves through and what each one owes.";

// The trailing underscore keeps Presets out from under matters.flow, which
// renders the Flow index without an outlet.
export const Route = createFileRoute("/matters/flow_/presets")({
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
      <PresetsLibrary />
    </Authed>
  ),
});
