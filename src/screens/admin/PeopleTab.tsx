/**
 * Everyone who has signed in to Scripta: their firms, when they joined and
 * when they were last active. Administrator access is granted and removed
 * here, on the person.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import { useConfirm } from "@/components/Confirm";
import { addPlatformAdmin, removePlatformAdmin } from "@/lib/platform-admin";
import { logAdminEvent } from "@/lib/platform";
import { ago, loadPeople, type AdminPerson } from "@/lib/admin-data";
import { useAdminActor } from "./actor";

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export default function PeopleTab() {
  const qc = useQueryClient();
  const actor = useAdminActor();
  const { confirm, confirmDialog } = useConfirm();
  const people = useQuery({ queryKey: ["admin", "people"], queryFn: loadPeople });
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "admins" | "quiet">("all");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["platform-admins"] });
    void qc.invalidateQueries({ queryKey: ["platform-admin"] });
  };
  const grant = useMutation({
    mutationFn: async (p: AdminPerson) => {
      await addPlatformAdmin(p.email, actor.id);
      await logAdminEvent(
        actor,
        "admin.granted",
        p.id,
        `Administrator access granted to ${p.name}`,
      );
    },
    onSuccess: (_, p) => {
      setNotice(`${p.name} is now an administrator.`);
      refresh();
    },
    onError: (e: unknown) => setNotice(e instanceof Error ? e.message : "That did not save."),
  });
  const revoke = useMutation({
    mutationFn: async (p: AdminPerson) => {
      await removePlatformAdmin(p.id);
      await logAdminEvent(
        actor,
        "admin.removed",
        p.id,
        `Administrator access removed from ${p.name}`,
      );
    },
    onSuccess: (_, p) => {
      setNotice(`${p.name} is no longer an administrator. They keep their account and their work.`);
      refresh();
    },
    onError: (e: unknown) => setNotice(e instanceof Error ? e.message : "That did not save."),
  });

  const all = people.data ?? [];
  const month = Date.now() - 30 * 86_400_000;
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (show === "all" ||
        (show === "admins" && p.isAdmin) ||
        (show === "quiet" && (!p.lastActive || Date.parse(p.lastActive) < month))) &&
      (!q ||
        `${p.name} ${p.email} ${p.roleTitle} ${p.workspaces.map((w) => w.name).join(" ")}`
          .toLowerCase()
          .includes(q)),
  );

  const exportCsv = () => {
    const rows = [
      ["Name", "Email", "Role", "Firms", "Administrator", "Joined", "Last active"],
      ...shown.map((p) => [
        p.name,
        p.email,
        p.roleTitle,
        p.workspaces.map((w) => `${w.name} (${w.role})`).join("; "),
        p.isAdmin ? "Yes" : "No",
        p.joined.slice(0, 10),
        p.lastActive?.slice(0, 10) ?? "",
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scripta-people-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="adm-toolbar">
        <input
          type="search"
          placeholder="Search people and firms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
        />
        <select
          value={show}
          onChange={(e) => setShow(e.target.value as typeof show)}
          aria-label="Show"
        >
          <option value="all">Everyone ({all.length})</option>
          <option value="admins">Administrators ({all.filter((p) => p.isAdmin).length})</option>
          <option value="quiet">Not active in 30 days</option>
        </select>
        <div style={{ flex: 1 }} />
        <Button onClick={exportCsv} disabled={!shown.length}>
          Export CSV
        </Button>
      </div>
      {notice && (
        <p role="status" className="adm-muted">
          {notice}
        </p>
      )}
      {people.isLoading ? (
        <p className="adm-muted">Loading…</p>
      ) : people.isError ? (
        <p className="adm-error">{(people.error as Error).message}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Firms</th>
                <th>Joined</th>
                <th>Last active</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong style={{ fontWeight: 600 }}>{p.name}</strong>
                    <div className="adm-muted" style={{ fontSize: 12 }}>
                      {p.email}
                      {p.roleTitle ? ` · ${p.roleTitle}` : ""}
                    </div>
                  </td>
                  <td>
                    {p.workspaces.length === 0 ? (
                      <span className="adm-muted">None</span>
                    ) : (
                      p.workspaces.map((w) => (
                        <div key={`${w.name}-${w.role}`}>
                          {w.name} <span className="adm-muted">· {w.role}</span>
                        </div>
                      ))
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{ago(p.joined)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{ago(p.lastActive)}</td>
                  <td>
                    <div className="adm-actions">
                      {p.isAdmin && <span className="adm-badge is-admin">Administrator</span>}
                      {p.id === actor.id ? (
                        <span className="adm-muted">You</span>
                      ) : p.isAdmin ? (
                        <Button
                          disabled={revoke.isPending}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `Remove administrator access from ${p.name}?`,
                                body: "They keep their account and their work. You can grant it again here.",
                                confirmLabel: "Remove access",
                              })
                            )
                              revoke.mutate(p);
                          }}
                        >
                          Remove admin
                        </Button>
                      ) : (
                        <Button
                          disabled={grant.isPending || !p.email}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `Make ${p.name} an administrator?`,
                                body: "Administrators can change what everyone can use, read all feedback and see AI spend across the platform.",
                                confirmLabel: "Make administrator",
                              })
                            )
                              grant.mutate(p);
                          }}
                        >
                          Make admin
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDialog}
    </>
  );
}
