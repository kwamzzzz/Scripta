import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { moveToBin } from "@/lib/trash";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button, EmptyState, Skeleton } from "@/components/primitives";
import LoadError from "@/components/LoadError";
import SaveState from "@/components/SaveState";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  loadPrecedent,
  PRECEDENT_FIELDS,
  updatePrecedent,
  type PrecedentPatch,
} from "@/lib/precedents";
import KnowledgeSharing from "@/components/KnowledgeSharing";
import { describeProvenance, usePrecedentProvenance } from "@/lib/knowledge";
import "./knowledge-screen.css";

/**
 * One precedent, as it is.
 *
 * What stood here was 654 lines of fixture: a fixed convertible-loan agreement
 * — Effectiveness, Purpose of Loan, Interest, Conversion Mechanics — drawn
 * around whatever clause text the record actually held, under a provenance
 * line reading "Imported from the executed PDF · redacted for client names on
 * insert" that consulted nothing. Five action controls beneath it did nothing
 * at all.
 *
 * A precedent is evidence: this wording was agreed, on this deal, in this
 * jurisdiction. Its whole value is that it happened. Wrapping it in a deal
 * that did not is the one thing a precedent bank must never do.
 *
 * So this shows the record and nothing else. Where it came from is the note
 * the lawyer wrote, or an admission that nobody wrote one.
 */

export default function PrecedentDetailScreen({ precedentId }: { precedentId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const provenance = usePrecedentProvenance(precedentId);
  const provenanceLine = describeProvenance(provenance.data ?? null);

  const precedent = useQuery({
    queryKey: ["precedent", precedentId],
    queryFn: () => loadPrecedent(precedentId),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (patch: PrecedentPatch) => updatePrecedent(precedentId, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["precedent", precedentId] }),
  });

  const remove = useMutation({
    mutationFn: () => moveToBin("precedents", [precedentId]),
    onSuccess: () => void navigate({ to: "/knowledge" }),
  });

  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** Asked the way the precedents library asks it. */
  const askRemove = async (title: string) => {
    if (
      await confirmDelete({
        what: `“${title}”`,
        consequence: "The wording goes with it.",
      })
    )
      remove.mutate();
  };

  const crumbs = (last: string) => (
    <Crumbs items={[{ label: "Precedents", to: "/knowledge" }, { label: last }]} />
  );
  const back = { label: "Precedents", href: "/knowledge" };

  if (precedent.isError)
    return (
      <AppShell section="knowledge" back={back} breadcrumb={crumbs("…")}>
        <div className="scripta-page precedent-detail">
          <LoadError
            what="precedent"
            error={precedent.error as Error}
            onRetry={() => void precedent.refetch()}
          />
        </div>
      </AppShell>
    );

  if (precedent.isPending)
    return (
      <AppShell section="knowledge" back={back} breadcrumb={crumbs("…")}>
        <div
          className="scripta-page precedent-detail precedent-loading"
          role="status"
          aria-label="Loading precedent"
        >
          <Skeleton h={30} w={320} />
          <Skeleton h={120} />
        </div>
      </AppShell>
    );

  const p = precedent.data;
  if (!p)
    return (
      <AppShell section="knowledge" back={back} breadcrumb={crumbs("Not found")}>
        <div className="scripta-page precedent-detail">
          <EmptyState
            title="That precedent is not here"
            body="It may have been deleted, or the link may be wrong."
            action={<Button onClick={() => void navigate({ to: "/knowledge" })}>Precedents</Button>}
          />
        </div>
      </AppShell>
    );

  return (
    <AppShell
      section="knowledge"
      back={back}
      trackLabel={p.title}
      breadcrumb={crumbs(p.title)}
      assistant={{
        key: `precedent.${p.id}`,
        label: p.title,
        screen: "Precedent record",
        intro:
          "Ask what this wording conceded, which side we acted for when it was agreed, and whether it carries over to the deal in front of you.",
      }}
    >
      <div className="scripta-page precedent-detail">
        <header className="scripta-page-heading">
          <div>
            <h1 className="scripta-page-title">{p.title}</h1>
            <p className="scripta-page-description">Precedent record</p>
          </div>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => void askRemove(p.title)}
          >
            {remove.isPending ? "Deleting…" : "Delete precedent"}
          </Button>
        </header>
        {/* Save failures are reported on the save line itself; this is the
            delete that could not happen. */}
        {remove.isError && (
          <div className="scripta-feedback is-error" role="alert">
            {(remove.error as Error).message}
          </div>
        )}

        {/* Approved is a deliberate act, never implied. A precedent used once
            is not the firm's position; it is one example of what was accepted
            on one deal, and treating every past agreement as approved drafting
            is how a bad compromise becomes a house style.

            This used to be a checkbox writing `approved` straight to the row —
            no approver, no date, and anybody who could edit could tick it. It
            is now the panel below: the column is off the update grant, and
            approving is an act performed by somebody entitled to perform it. */}
        <section className="precedent-record">
          <KnowledgeSharing
            kind="precedent"
            id={p.id}
            facts={{
              visibility: p.visibility,
              approvedAt: p.approvedAt,
              contentChangedAt: p.contentChangedAt,
            }}
          />
        </section>

        {/* Where it came from, to the extent this lawyer may hear it. */}
        {provenanceLine && (
          <p style={{ margin: 0, color: "var(--scripta-muted, #626c70)", fontSize: 12.5 }}>
            {provenanceLine}
          </p>
        )}

        <section className="precedent-record" aria-labelledby="precedent-details-title">
          <h2 id="precedent-details-title">Details</h2>
          <div className="precedent-fields">
            {PRECEDENT_FIELDS.map((f) => (
              <label
                key={String(f.key)}
                htmlFor={`precedent-${String(f.key)}`}
                className={`scripta-form-field${f.key === "sourceNote" || f.key === "title" ? " precedent-field-wide" : ""}`}
              >
                <span>{f.label}</span>
                <input
                  id={`precedent-${String(f.key)}`}
                  defaultValue={(p[f.key as keyof typeof p] as string) ?? ""}
                  placeholder={f.placeholder}
                  onBlur={(e) => {
                    const next = e.target.value;
                    if (next !== ((p[f.key as keyof typeof p] as string) ?? ""))
                      save.mutate({ [f.key]: next } as PrecedentPatch);
                  }}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="precedent-wording" aria-labelledby="precedent-wording-title">
          <h2 id="precedent-wording-title">
            <label htmlFor="precedent-body">Clause wording</label>
          </h2>
          <textarea
            id="precedent-body"
            aria-describedby="precedent-save-note"
            rows={18}
            defaultValue={p.body}
            placeholder="Enter the clause as it was agreed."
            onBlur={(e) => {
              if (e.target.value !== p.body) save.mutate({ body: e.target.value });
            }}
          />
          <div id="precedent-save-note" className="precedent-save-note">
            <SaveState
              mode="on-blur"
              status={save.isError ? "error" : save.isPending ? "saving" : "idle"}
              error={save.isError ? (save.error as Error).message : undefined}
            />{" "}
            Last saved {new Date(p.updatedAt).toLocaleString()}.
          </div>
        </section>
        {confirmDialog}
      </div>
    </AppShell>
  );
}
