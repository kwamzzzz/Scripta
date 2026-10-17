import { createFileRoute, useParams } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import LearningScreen from "@/screens/LearningScreen";

const validateSearch = (search: Record<string, unknown>): { mode?: string } =>
  search["mode"] === "authoring" ? { mode: "authoring" } : {};

function ModuleRoute() {
  const { courseId, moduleId } = useParams({ from: "/learning/c/$courseId_/m/$moduleId" });
  return (
    <Authed>
      <LearningScreen courseId={courseId} moduleId={moduleId} />
    </Authed>
  );
}

export const Route = createFileRoute("/learning/c/$courseId_/m/$moduleId")({
  validateSearch,
  head: () => ({ meta: [{ title: "Module — Scripta" }] }),
  component: ModuleRoute,
});
