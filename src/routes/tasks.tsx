import { createFileRoute } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import TasksScreen from "@/screens/TasksScreen";

const title = "Tasks — Scripta";
const description = "Follow-through from review findings, transcript insights and drafting points.";

export const Route = createFileRoute("/tasks")({
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
      <TasksScreen />
    </Authed>
  ),
});
