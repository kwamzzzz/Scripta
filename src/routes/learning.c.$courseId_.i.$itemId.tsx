import { createFileRoute, useParams } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import LearningScreen from "@/screens/LearningScreen";

const validateSearch = (search: Record<string, unknown>): { mode?: string } =>
  search["mode"] === "authoring" ? { mode: "authoring" } : {};

function ItemRoute() {
  const { courseId, itemId } = useParams({ from: "/learning/c/$courseId_/i/$itemId" });
  return (
    <Authed>
      <LearningScreen courseId={courseId} itemId={itemId} />
    </Authed>
  );
}

export const Route = createFileRoute("/learning/c/$courseId_/i/$itemId")({
  validateSearch,
  head: () => ({ meta: [{ title: "Item — Scripta" }] }),
  component: ItemRoute,
});
