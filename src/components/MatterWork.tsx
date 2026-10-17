import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Panel, SectionLabel } from "@/components/praxis";
import { supabase } from "@/integrations/supabase/client";
import { C, mono } from "@/lib/tokens";

/**
 * What else belongs to this matter.
 *
 * Research and tasks have carried a matter_id all along, and nothing ever
 * showed them. A lawyer opening a matter could see its clauses and its
 * documents but not the research done for it or the work waiting on it — the
 * link existed in the database and was invisible on screen, which is the same
 * as not existing.
 *
 * Only things that can actually be opened are listed. Drafts also carry a
 * matter_id, and are deliberately absent until there is a route that opens
 * one: a row that cannot be clicked is a promise the screen cannot keep.
 */

type ResearchRow = { id: string; title: string; kind: string; updated_at: string };
type TaskRow = { id: string; title: string; status: string; due_date: string | null };

export default function MatterWork({ matterId }: { matterId: string }) {
  const navigate = useNavigate();

  const work = useQuery({
    queryKey: ["matter-work", matterId],
    queryFn: async () => {
      const [research, tasks] = await Promise.all([
        supabase
          .from("research_matters")
          .select("id, title, kind, updated_at")
          .eq("matter_id", matterId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("tasks")
          .select("id, title, status, due_date")
          .eq("matter_id", matterId)
          .neq("status", "Done")
          .order("created_at", { ascending: false }),
      ]);
      if (research.error) throw research.error;
      if (tasks.error) throw tasks.error;
      return {
        research: (research.data ?? []) as ResearchRow[],
        tasks: (tasks.data ?? []) as TaskRow[],
      };
    },
  });

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    padding: "9px 13px",
    borderTop: `1px solid ${C.rowRule}`,
    fontSize: 13,
    textAlign: "left",
    width: "100%",
    background: "transparent",
    border: "none",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: C.rowRule,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  if (work.isError) {
    return (
      <div style={{ padding: "0 22px 22px" }}>
        <SectionLabel style={{ marginBottom: 6 }}>Linked work</SectionLabel>
        <Panel style={{ padding: "10px 14px", fontSize: 13, color: C.red }}>
          Linked work could not be loaded. {(work.error as Error).message}
        </Panel>
      </div>
    );
  }

  const research = work.data?.research ?? [];
  const tasks = work.data?.tasks ?? [];

  return (
    <div style={{ padding: "0 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <SectionLabel style={{ marginBottom: 6 }}>
          Research on this matter{research.length ? ` (${research.length})` : ""}
        </SectionLabel>
        <Panel style={{ padding: 0 }}>
          {work.isPending ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>Loading…</div>
          ) : research.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>
              No research is linked to this matter yet.
            </div>
          ) : (
            research.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  void navigate({ to: "/research/$researchId", params: { researchId: r.id } })
                }
                style={{ ...row, ...(i === 0 ? { borderTopWidth: 0 } : {}) }}
              >
                <span style={{ flex: 1, minWidth: 0, color: C.body }}>{r.title}</span>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
                  {r.kind === "simple" ? "SIMPLE" : "COMPREHENSIVE"}
                </span>
              </button>
            ))
          )}
        </Panel>
      </div>

      <div>
        <SectionLabel style={{ marginBottom: 6 }}>
          Open tasks{tasks.length ? ` (${tasks.length})` : ""}
        </SectionLabel>
        <Panel style={{ padding: 0 }}>
          {work.isPending ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>Loading…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>
              Nothing waiting on this matter.
            </div>
          ) : (
            tasks.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void navigate({ to: "/tasks" })}
                style={{ ...row, ...(i === 0 ? { borderTopWidth: 0 } : {}) }}
              >
                <span style={{ flex: 1, minWidth: 0, color: C.body }}>{t.title}</span>
                <span style={{ fontFamily: mono, fontSize: 11.5, color: C.muted }}>
                  {t.status.toUpperCase()}
                  {t.due_date ? ` · due ${new Date(t.due_date).toLocaleDateString()}` : ""}
                </span>
              </button>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}
