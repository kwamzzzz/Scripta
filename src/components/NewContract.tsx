import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FilePlus } from "lucide-react";
import { createBlankContract } from "@/lib/review.functions";
import { useOpenMatter } from "@/components/MatterCard";
import { useApp } from "@/store/app";
import { Button } from "@/components/primitives";
import { C, radius } from "@/lib/tokens";

/**
 * Draft a contract from nothing. Inline title, no modal, no browser prompt.
 * With no matter selected it starts one; inside a matter it adds to that matter.
 */
export default function NewContract({ compact = false }: { compact?: boolean }) {
  const { workspaceId, matterId, set } = useApp();
  const open = useOpenMatter();
  const qc = useQueryClient();
  const run = useServerFn(createBlankContract);
  const [openForm, setOpenForm] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await run({ data: { workspaceId, matterId: matterId ?? undefined, title } });
      await qc.invalidateQueries();
      setOpenForm(false);
      setTitle("");
      if (matterId && res.matterId === matterId) {
        set({ screen: "review", selClause: res.clauseId, reviewView: "reading" });
      } else {
        await open(res.matterId, { screen: "review", clause: res.clauseId, label: "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the draft");
    } finally {
      setBusy(false);
    }
  };

  if (!openForm) {
    return compact ? (
      <span
        onClick={() => setOpenForm(true)}
        className="px-link"
        style={{ fontSize: 12, color: C.accent, cursor: "pointer" }}
      >
        + New contract
      </span>
    ) : (
      <Button variant="secondary" onClick={() => setOpenForm(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <FilePlus size={13} strokeWidth={2} /> New contract
        </span>
      </Button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        autoFocus
        value={title}
        placeholder="Contract title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void go();
          if (e.key === "Escape") setOpenForm(false);
        }}
        style={{
          fontSize: 12,
          padding: "4px 8px",
          border: `1px solid ${C.border}`,
          borderRadius: radius.sm,
          width: 220,
          fontFamily: "inherit",
        }}
      />
      <Button variant="primary" onClick={() => void go()} disabled={busy}>
        {busy ? "Creating…" : "Create"}
      </Button>
      <Button variant="quiet" onClick={() => setOpenForm(false)}>
        Cancel
      </Button>
      {error && <span style={{ fontSize: 11, color: C.red }}>{error}</span>}
    </span>
  );
}
