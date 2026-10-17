import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import PresetEditor from "@/matter-flow/presets/PresetEditor";

const title = "Preset — Scripta";
const description = "One variant of a reusable matter structure: its phases, deliverables and roles.";

export const Route = createFileRoute("/matters/flow_/presets_/$presetId")({
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
  component: EditorRoute,
});

function EditorRoute() {
  const { presetId } = Route.useParams();
  return (
    <Authed>
      <PresetEditor presetId={presetId} />
    </Authed>
  );
}
