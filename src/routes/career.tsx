import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import CareerScreen from "@/screens/CareerScreen";

const title = "Career — Scripta";
const description =
  "What a role expects of you, what you can prove you have done, and the experience worth seeking next.";

export const Route = createFileRoute("/career")({
  // Which view is open, and which role is being read, so a link can land on both.
  validateSearch: (search: Record<string, unknown>): { tab?: string; role?: string } => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] } : {}),
    ...(typeof search["role"] === "string" ? { role: search["role"] } : {}),
  }),
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
      <CareerScreen />
    </Authed>
  ),
});
