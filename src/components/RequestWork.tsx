/**
 * Please do this.
 *
 * The verb that creates work, kept distinct from the three that do not. It
 * makes a task in somebody's list — the one list that answers "what do I have
 * to do" — and that task can be declined, which is what makes it an ask rather
 * than an instruction.
 *
 * It lives beside the matter team because that is where the people are, and
 * because the only people who can be asked are the people on the file. A
 * Reviewer may ask: asking a colleague to do something is part of reviewing
 * their work. A Viewer may not, and is shown nothing.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { useMatterTeam } from "@/lib/matter-team";
import { useWorkActions } from "@/lib/work";
import { C, radius } from "@/lib/tokens";

export default function RequestWork({ matterId }: { matterId: string }) {
  const { user } = useAuth();
  const team = useMatterTeam(matterId);
  const work = useWorkActions();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const members = team.data ?? [];
  const me = members.find((m) => m.userId === user?.id);
  // A Viewer follows the matter without working on it, and cannot hand work to
  // anybody else either. Absent, not disabled.
  const mayAsk = !!me && me.role !== "viewer";
  const candidates = members.filter((m) => m.userId !== user?.id && m.role !== "viewer");

  if (!mayAsk) return null;

  const field: React.CSSProperties = {
    border: `1px solid ${C.border}`,
    borderRadius: radius.md,
    padding: "7px 9px",
    font: "inherit",
    fontSize: 13,
    background: C.panel,
    color: C.text,
    width: "100%",
    boxSizing: "border-box",
  };

  if (!open) {
    return (
      <button type="button" className="mt-action" onClick={() => setOpen(true)}>
        Ask someone to do something
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {problem && (
        <p role="alert" style={{ margin: 0, color: C.red, fontSize: 12.5 }}>
          {problem}
        </p>
      )}
      <select
        aria-label="Who are you asking?"
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        style={field}
      >
        <option value="">Who are you asking?</option>
        {candidates.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.name}
          </option>
        ))}
      </select>
      {candidates.length === 0 && (
        <p style={{ margin: 0, color: C.muted, fontSize: 12.5 }}>
          There is nobody else on this matter to ask.
        </p>
      )}
      <input
        aria-label="What do you need?"
        placeholder="What do you need?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={field}
      />
      <textarea
        aria-label="Anything they should know"
        placeholder="Anything they should know"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        style={{ ...field, minHeight: 56, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 7 }}>
        <Button
          variant="primary"
          disabled={!assignee || !title.trim() || work.request.isPending}
          onClick={() => {
            setProblem(null);
            void work.request
              .mutateAsync({
                matterId,
                assignee,
                title: title.trim(),
                detail: detail.trim() || null,
              })
              .then(() => {
                setOpen(false);
                setAssignee("");
                setTitle("");
                setDetail("");
              })
              .catch((cause: unknown) =>
                setProblem(cause instanceof Error ? cause.message : "The request was refused."),
              );
          }}
        >
          Ask
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p style={{ margin: 0, color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>
        They can decline, and it comes back to you rather than disappearing.
      </p>
    </div>
  );
}
