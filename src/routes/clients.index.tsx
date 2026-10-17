import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import ClientsLibrary from "@/clients/ClientsLibrary";

const title = "Clients — Scripta";
const description = "Who the firm acts for, and the matters, flows and tasks open for each.";

export const Route = createFileRoute("/clients/")({
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
      <ClientsLibrary />
    </Authed>
  ),
});
