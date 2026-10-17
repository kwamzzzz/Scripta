import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn, type LibView } from "@/components/Library";
import LibraryCard from "@/components/LibraryCard";
import LibraryEmpty from "@/components/LibraryEmpty";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import { archiveLabel, archiveVerb } from "@/lib/archive";
import { binCountdown, moveToBin, restoreFromBin } from "@/lib/trash";
import {
  archiveContractDrafts,
  contractDraftMatchesView,
  contractDraftStageLabel,
  contractDraftTitle,
  contractDraftsQueryKey,
  deleteContractDraft,
  errorMessage,
  listContractDrafts,
  type ContractDraft,
  type ContractDraftView,
} from "@/lib/contract-drafts";
import { relTime } from "@/lib/home-data";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";

const DRAFT_STAGES = ["Brief", "Plan agreed", "Drafting", "Accepted"];

export default function ContractDraftingLibrary() {
  const { workspaceId } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const drafts = useQuery({
    queryKey: contractDraftsQueryKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: () => listContractDrafts(workspaceId!),
    retry: false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: contractDraftsQueryKey(workspaceId) });
  const fresh = () => void navigate({ to: "/matters/contract-drafting/new" });
  const open = (draft: ContractDraft) => {
    if (draft.acceptedAt && draft.acceptedMatterId) {
      void navigate({
        to: "/matters/$matterId",
        params: { matterId: draft.acceptedMatterId },
        search: { screen: "review" },
      });
    } else {
      void navigate({ to: "/matters/contract-drafting/$draftId", params: { draftId: draft.id } });
    }
  };
  const archive = async (rows: ContractDraft[], archived: boolean) => {
    if (!rows.length) return;
    setNotice(null);
    try {
      await archiveContractDrafts(
        rows.map((row) => row.id),
        archived,
      );
      await refresh();
    } catch (cause) {
      setNotice(`Those drafts could not be ${archiveVerb(archived)}. ${errorMessage(cause)}`);
    }
  };
  const remove = async (rows: ContractDraft[]) => {
    if (!rows.length || !workspaceId) return;
    if (
      !(await confirmDelete({
        what:
          rows.length === 1
            ? `“${contractDraftTitle(rows[0]!)}”`
            : `${rows.length} contract drafts`,
        count: rows.length,
        consequence:
          "The saved brief, plan and draft wording go too. Any accepted matter and its documents and clauses stay.",
      }))
    )
      return;
    setNotice(null);
    try {
      await moveToBin(
        "contract_drafts",
        rows.map((row) => row.id),
      );
    } catch (cause) {
      setNotice(errorMessage(cause, "Those drafts could not be deleted."));
    } finally {
      await refresh();
    }
  };

  /** Out of Recently Deleted, back to wherever it was — archived ones included. */
  const restore = async (rows: ContractDraft[]) => {
    if (!rows.length) return;
    setNotice(null);
    try {
      await restoreFromBin(
        "contract_drafts",
        rows.map((row) => row.id),
      );
    } catch (cause) {
      setNotice(errorMessage(cause, "Those drafts could not be restored."));
    } finally {
      await refresh();
    }
  };

  /**
   * Before the fifteen days are up. `deleteContractDraft` scopes the delete to
   * the workspace, which is the check the library has always deleted through.
   */
  const removeForGood = async (rows: ContractDraft[]) => {
    if (!rows.length || !workspaceId) return;
    if (
      !(await confirmDelete({
        what:
          rows.length === 1
            ? `“${contractDraftTitle(rows[0]!)}”`
            : `${rows.length} contract drafts`,
        count: rows.length,
        consequence:
          "The saved brief, plan and draft wording go too. Any accepted matter and its documents and clauses stay.",
        binned: false,
      }))
    )
      return;
    setNotice(null);
    try {
      for (const row of rows) await deleteContractDraft(row.id, workspaceId);
    } catch (cause) {
      setNotice(errorMessage(cause, "Those drafts could not be deleted."));
    } finally {
      await refresh();
    }
  };
  const columns: LibColumn<ContractDraft>[] = [
    {
      key: "title",
      label: "Contract",
      value: (r) => contractDraftTitle(r).toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: C.text }}>{contractDraftTitle(r)}</span>
          {r.deletedAt && (
            <div style={{ color: C.muted, fontSize: 11.5 }}>{binCountdown(r.deletedAt)}</div>
          )}
        </div>
      ),
    },
    {
      key: "type",
      label: "Agreement type",
      width: 200,
      value: (r) => r.agreementType,
      render: (r) => r.agreementType || "Not supplied",
    },
    {
      key: "stage",
      label: "Stage",
      width: 140,
      value: contractDraftStageLabel,
      render: contractDraftStageLabel,
    },
    {
      key: "matter",
      label: "Matter",
      width: 220,
      value: (r) => r.acceptedMatterName || r.matterName,
      render: (r) =>
        r.acceptedAt
          ? r.acceptedMatterName || "Accepted matter no longer available"
          : r.matterName || "No matter yet",
    },
    {
      key: "updated",
      label: "Updated",
      width: 120,
      value: (r) => r.updatedAt,
      render: (r) => <span style={{ color: C.muted }}>{relTime(r.updatedAt)}</span>,
    },
  ];
  // A deleted draft leaves every view, Archived included: it is in the bin,
  // not merely put aside.
  const views: LibView<ContractDraft>[] = [
    ...(["All", "Accepted", "Archived"] as ContractDraftView[]).map((view) => ({
      key: view,
      label: view,
      filter: (r: ContractDraft) => !r.deletedAt && contractDraftMatchesView(r, view),
    })),
    { key: "Deleted", label: "Recently Deleted", filter: (r: ContractDraft) => !!r.deletedAt },
  ];

  return (
    <AppShell
      section="contract-drafting"
      scroll={false}
      breadcrumb={<Crumbs items={[{ label: "Contract Drafting" }]} />}
      hideAssistant
    >
      {(notice || drafts.isError) && (
        <div role="alert" style={{ padding: "8px 20px", color: C.red, fontSize: 12.5 }}>
          {notice ?? errorMessage(drafts.error, "Contract drafts could not be loaded.")}
          {drafts.isError && <Button onClick={() => void drafts.refetch()}>Try again</Button>}
        </div>
      )}
      <Library
        storageKey="contract-drafts"
        title="Contract Drafting"
        description="Plan a contract, draft its clauses and review the wording. Your brief and work in progress are kept here until you accept the contract into a matter."
        rows={drafts.data ?? []}
        columns={columns}
        views={views}
        rowLabel={contractDraftTitle}
        searchText={(r) =>
          [
            r.title,
            r.agreementType,
            contractDraftStageLabel(r),
            r.matterName,
            r.acceptedMatterName,
          ].join(" ")
        }
        searchPlaceholder="Search contract drafts"
        onOpen={open}
        board={{
          columns: DRAFT_STAGES,
          column: contractDraftStageLabel,
          card: (r) => (
            <LibraryCard
              compact
              title={contractDraftTitle(r)}
              onOpen={() => open(r)}
              subtitle={r.agreementType || "Agreement type not supplied"}
            />
          ),
        }}
        cards={(r) => (
          <LibraryCard
            title={contractDraftTitle(r)}
            onOpen={() => open(r)}
            subtitle={
              r.acceptedAt
                ? r.acceptedMatterName || "Accepted matter no longer available"
                : r.matterName || "No matter yet"
            }
            state={contractDraftStageLabel(r)}
            facts={[
              r.agreementType || "Agreement type not supplied",
              `${r.plan?.clauses.length ?? 0} clauses planned`,
              `${r.outcomes.filter((o) => o.ok).length} drafted`,
            ]}
            footer={`Updated ${relTime(r.updatedAt)}`}
          />
        )}
        primary={{ label: "New contract", onClick: fresh }}
        actions={(r) =>
          r.deletedAt
            ? [
                { label: "Restore", onClick: () => void restore([r]) },
                { label: "Delete for good", danger: true, onClick: () => void removeForGood([r]) },
              ]
            : [
                { label: "Open", onClick: () => open(r) },
                {
                  label: archiveLabel(!!r.archivedAt),
                  onClick: () => void archive([r], !r.archivedAt),
                },
                { label: "Delete", danger: true, onClick: () => void remove([r]) },
              ]
        }
        bulk={(view) =>
          view === "Deleted"
            ? [
                { label: "Restore", onClick: (rows) => void restore(rows) },
                {
                  label: "Delete for good",
                  danger: true,
                  onClick: (rows) => void removeForGood(rows),
                },
              ]
            : [
                { label: "Archive", onClick: (rows) => void archive(rows, true) },
                { label: "Restore", onClick: (rows) => void archive(rows, false) },
                { label: "Delete", danger: true, onClick: (rows) => void remove(rows) },
              ]
        }
        detail={(r) => (
          <div className="scripta-matter-detail">
            <header>
              <h2>{contractDraftTitle(r)}</h2>
              <p>Created {relTime(r.createdAt)}</p>
            </header>
            <Button variant="primary" onClick={() => open(r)}>
              {r.acceptedAt
                ? r.acceptedMatterId
                  ? "Open accepted matter"
                  : "View saved draft"
                : "Open draft"}
            </Button>
            <section>
              <h3>Draft details</h3>
              <dl>
                <dt>Agreement</dt>
                <dd>{r.agreementType || "Not supplied"}</dd>
                <dt>Stage</dt>
                <dd>{contractDraftStageLabel(r)}</dd>
                <dt>Matter</dt>
                <dd>
                  {r.acceptedAt
                    ? r.acceptedMatterName || "Accepted matter no longer available"
                    : r.matterName || "No matter yet"}
                </dd>
                <dt>Law</dt>
                <dd>{r.governingLaw || "Not supplied"}</dd>
                <dt>Clauses</dt>
                <dd>
                  {r.plan?.clauses.length ?? 0} planned · {r.outcomes.filter((o) => o.ok).length}{" "}
                  drafted
                </dd>
              </dl>
            </section>
          </div>
        )}
        empty={
          drafts.isLoading ? (
            <p role="status">Loading contract drafts…</p>
          ) : drafts.isError ? (
            <p>Contract drafts could not be loaded. Try again using the control above.</p>
          ) : (
            <LibraryEmpty
              title="Start with the contract you need"
              action={{ label: "New contract", onClick: fresh }}
            >
              Describe the transaction, agree the clause plan, then review and accept the drafted
              wording. Your work is saved as you go.
            </LibraryEmpty>
          )
        }
      />
      {confirmDialog}
    </AppShell>
  );
}
