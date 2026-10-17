import { createFileRoute, useParams } from "@tanstack/react-router";
import Authed from "@/components/Authed";
import LearningScreen from "@/screens/LearningScreen";

/** Learner and author are a mode on this route, not a separate tree. */
const validateSearch = (search: Record<string, unknown>): { mode?: string } =>
  search["mode"] === "authoring" ? { mode: "authoring" } : {};

function CourseRoute() {
  const { courseId } = useParams({ from: "/learning/c/$courseId" });
  return (
    <Authed>
      <LearningScreen courseId={courseId} />
    </Authed>
  );
}

export const Route = createFileRoute("/learning/c/$courseId")({
  validateSearch,
  head: () => ({ meta: [{ title: "Course — Scripta" }] }),
  component: CourseRoute,
});
