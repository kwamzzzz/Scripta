/**
 * The Chapter Map: the manuscript's argument laid out chapter by chapter, and
 * which research question each chapter answers. A question no chapter answers
 * shows as an empty row, which is the finding in itself.
 */
import { Card, Chip, Eyebrow } from "@/review/ui";
import { Button } from "@/components/primitives";
import type { Chapter, Manuscript } from "./db";

export default function MapPanel({
  manuscript,
  chapters,
  onOpenChapter,
  onMap,
  busy,
}: {
  manuscript: Manuscript;
  chapters: Chapter[];
  onOpenChapter: (key: string) => void;
  onMap: () => void;
  busy: boolean;
}) {
  const map = manuscript.map;
  const byKey = new Map(chapters.map((c) => [c.chapterKey, c]));
  const name = (key: string) => {
    const c = byKey.get(key);
    return c
      ? [c.number, c.title].filter(Boolean).join(" ")
      : "A chapter no longer in this version";
  };
  if (!map)
    return (
      <Card title="Chapter map">
        <p className="ms-quiet">
          The map is drawn from the chapter summaries during a full review or a final consistency
          review. It shows how the chapters build the argument and which research question each one
          answers.
        </p>
        <div>
          <Button variant="primary" disabled={busy} onClick={onMap}>
            Draw the map
          </Button>
        </div>
      </Card>
    );
  const answeredBy = (rq: string) =>
    map.chapters.filter((c) => c.answers.some((a) => a.toLowerCase() === rq.toLowerCase()));
  return (
    <div className="ms-map">
      <Card
        title="The argument"
        right={
          <Button variant="quiet" disabled={busy} onClick={onMap}>
            Redraw
          </Button>
        }
      >
        {map.thesis && (
          <p>
            <strong>Thesis.</strong> {map.thesis}
          </p>
        )}
        {map.methodology && (
          <p>
            <strong>Method.</strong> {map.methodology}
          </p>
        )}
        {map.objectives.length > 0 && (
          <>
            <Eyebrow>Objectives</Eyebrow>
            <ul className="ms-plain">
              {map.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {map.researchQuestions.length > 0 && (
        <Card title="Research questions" hint="Which chapters answer each question.">
          <table className="ms-rq">
            <tbody>
              {map.researchQuestions.map((q) => {
                const by = answeredBy(q.id);
                return (
                  <tr key={q.id} className={by.length ? "" : "is-gap"}>
                    <th>{q.id}</th>
                    <td>{q.text}</td>
                    <td>
                      {by.length ? (
                        by.map((c) => (
                          <button
                            key={c.chapterKey}
                            type="button"
                            className="ms-place"
                            onClick={() => onOpenChapter(c.chapterKey)}
                          >
                            {name(c.chapterKey)}
                          </button>
                        ))
                      ) : (
                        <Chip tone="medium">No chapter answers it</Chip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Card title="Chapter by chapter">
        <ol className="ms-flow">
          {map.chapters.map((c) => (
            <li key={c.chapterKey}>
              <button
                type="button"
                className="ms-flow-name"
                onClick={() => onOpenChapter(c.chapterKey)}
              >
                {name(c.chapterKey)}
              </button>
              <p>{c.role}</p>
              {c.establishes.length > 0 && (
                <p className="ms-small">
                  <span className="ms-muted">Establishes:</span> {c.establishes.join("; ")}
                </p>
              )}
              {c.reliesOn.length > 0 && (
                <p className="ms-small">
                  <span className="ms-muted">Relies on:</span> {c.reliesOn.join("; ")}
                </p>
              )}
              {c.answers.length > 0 && (
                <p className="ms-small">
                  <span className="ms-muted">Answers:</span> {c.answers.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
