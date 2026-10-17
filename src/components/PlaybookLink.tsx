/**
 * The playbook this matter is reviewed against.
 *
 * Shown on the Contract card because that is where a lawyer goes to ask what
 * this matter IS, and "which of our positions apply to it" is one of those
 * facts. It is a choice rather than a record: until this existed, a matter
 * opened without a playbook could never be given one — see `playbook-link.ts`.
 *
 * It says what the playbook is worth, not only its name. A playbook with
 * eighteen headings and two positions written will review a contract against
 * two positions, and a lawyer choosing between them deserves to know that
 * before the review runs rather than after it comes back quiet.
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useLinkPlaybook, useMatterPlaybookId, usePlaybookChoices } from "@/lib/playbook-link";
import { C, mono, radius } from "@/lib/tokens";

export default function PlaybookLink({
  matterId,
  workspaceId,
}: {
  matterId: string;
  workspaceId: string | null | undefined;
}) {
  const choices = usePlaybookChoices(workspaceId);
  const linked = useMatterPlaybookId(matterId);
  const link = useLinkPlaybook(matterId);
  const [problem, setProblem] = useState<string | null>(null);

  const list = choices.data ?? [];
  const chosen = list.find((playbook) => playbook.id === linked.data);

  const choose = (id: string) => {
    setProblem(null);
    link.mutate(id || null, {
      onError: (cause) =>
        setProblem(cause instanceof Error ? cause.message : "That could not be saved."),
    });
  };

  return (
    <div style={{ borderTop: `1px solid ${C.cardRule}`, marginTop: 11, paddingTop: 11 }}>
      <label
        htmlFor="matter-playbook"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: C.secondary,
          font: `500 10px ${mono}`,
          letterSpacing: ".08em",
        }}
      >
        <BookOpen size={12} /> PLAYBOOK
      </label>

      <select
        id="matter-playbook"
        value={linked.data ?? ""}
        disabled={link.isPending || choices.isLoading || linked.isLoading}
        onChange={(event) => choose(event.target.value)}
        style={{
          marginTop: 6,
          width: "100%",
          border: `1px solid ${C.border}`,
          borderRadius: radius.md,
          background: C.panel,
          color: C.text,
          font: "inherit",
          fontSize: 13,
          padding: "7px 9px",
        }}
      >
        <option value="">None linked</option>
        {list.map((playbook) => (
          <option key={playbook.id} value={playbook.id}>
            {playbook.name}
            {playbook.status && playbook.status !== "Active" ? ` · ${playbook.status}` : ""}
          </option>
        ))}
      </select>

      {problem ? (
        <p role="alert" style={{ margin: "6px 0 0", color: C.red, fontSize: 12 }}>
          {problem}
        </p>
      ) : chosen ? (
        <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          {chosen.written === 0
            ? `${chosen.total} positions, none of them written yet. The review will have nothing to measure this contract against.`
            : `${chosen.written} of ${chosen.total} positions written. The review measures against those.`}
        </p>
      ) : list.length === 0 ? (
        <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          No playbooks in this workspace yet.
        </p>
      ) : (
        <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
          The review reads every clause either way. A playbook is what it measures them against.
        </p>
      )}
    </div>
  );
}
