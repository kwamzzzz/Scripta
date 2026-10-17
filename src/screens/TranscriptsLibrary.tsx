import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import Library, { type LibColumn } from "@/components/Library";
import LibraryCard from "@/components/LibraryCard";
import { Button } from "@/components/primitives";
import LoadError from "@/components/LoadError";
import { longDate, type BoardTranscript } from "@/lib/home-data";
import { useBoard } from "@/lib/use-board";
import { C } from "@/lib/tokens";

const STATUS: Record<string, string> = {
  raw: "Not distilled",
  distilling: "Distilling",
  distilled: "Distilled, not yet approved",
  approved: "Approved",
};
const statusOf = (r: BoardTranscript) => STATUS[r.status] ?? "Not distilled";

export default function TranscriptsLibrary() {
  const { board, loading, error, refetch } = useBoard();
  const navigate = useNavigate();
  const open = (id: string) =>
    void navigate({ to: "/transcripts/$transcriptId", params: { transcriptId: id } });
  const fresh = () => void navigate({ to: "/transcripts/new" });
  const matterNames = new Map(board.matters.map((matter) => [matter.id, matter.name]));
  const matterName = (transcript: BoardTranscript) => matterNames.get(transcript.matterId) ?? "";

  const columns: LibColumn<BoardTranscript>[] = [
    {
      key: "title",
      label: "Transcript",
      render: (r) => <span style={{ fontWeight: 600, color: C.text }}>{r.title}</span>,
      value: (r) => r.title.toLowerCase(),
    },
    {
      key: "matter",
      label: "Matter",
      width: 240,
      render: (r) => matterName(r) || <span style={{ color: C.faint }}>—</span>,
      value: matterName,
    },
    {
      key: "date",
      label: "Date",
      width: 140,
      render: (r) => <span style={{ color: C.muted }}>{longDate(r.date) || "—"}</span>,
      value: (r) => r.date ?? "",
    },
    {
      key: "duration",
      label: "Duration",
      width: 110,
      render: (r) => (r.durationMinutes === null ? "—" : `${r.durationMinutes} min`),
      value: (r) => r.durationMinutes ?? -1,
    },
    {
      key: "status",
      label: "Record",
      width: 200,
      render: (r) => <span style={{ color: C.muted }}>{statusOf(r)}</span>,
      value: statusOf,
    },
    {
      key: "speakers",
      label: "Speakers",
      width: 100,
      render: (r) => r.speakers ?? "—",
      value: (r) => r.speakers ?? -1,
    },
  ];

  return (
    <AppShell
      section="transcripts"
      breadcrumb={<Crumbs items={[{ label: "Transcript distiller" }]} />}
      scroll={false}
    >
      <LoadError what="transcripts" error={error} onRetry={() => void refetch()} />
      <Library
        storageKey="transcripts"
        title="Transcript distiller"
        description="Meeting transcripts and the decisions and drafting instructions they produced. Open a transcript to return to its workspace."
        rows={board.transcripts}
        columns={columns}
        views={[
          { key: "All", label: "All", filter: () => true },
          { key: "Review", label: "To approve", filter: (r) => r.status === "distilled" },
        ]}
        searchText={(r) => [r.title, matterName(r)].join(" ")}
        searchPlaceholder="Search transcripts and matters"
        rowLabel={(r) => r.title}
        onOpen={(r) => open(r.id)}
        primary={{ label: "New transcript", onClick: fresh }}
        // No board: a transcript is a record of a meeting and has no state to
        // group by. Grouping by matter would make a column per matter, which
        // is a list with extra steps.
        cards={(r) => (
          <LibraryCard
            title={r.title}
            onOpen={() => open(r.id)}
            subtitle={matterName(r) || "Matter unavailable"}
            facts={[
              statusOf(r),
              r.durationMinutes ? `${r.durationMinutes} min` : "",
              r.speakers ? `${r.speakers} speaker${r.speakers === 1 ? "" : "s"}` : "",
            ]}
            footer={
              r.date
                ? new Date(r.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : undefined
            }
          />
        )}
        actions={(r) => [{ label: "Open", onClick: () => open(r.id) }]}
        detail={(r) => (
          <div style={{ display: "grid", gap: 10, padding: 20, fontSize: 12.5, color: C.body }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>{r.title}</h2>
            <div style={{ color: C.muted }}>{matterName(r) || "Matter unavailable"}</div>
            <dl style={{ display: "grid", gap: 10, margin: 0 }}>
              {[
                ["Date", longDate(r.date) || "—"],
                ["Duration", r.durationMinutes === null ? "—" : `${r.durationMinutes} min`],
                ["Record", statusOf(r)],
                ["Speakers", r.speakers === null ? "—" : String(r.speakers)],
                ["Source", r.source || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt style={{ color: C.muted }}>{label}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <Button variant="primary" onClick={() => open(r.id)}>
                Open transcript
              </Button>
            </div>
          </div>
        )}
        empty={
          loading ? (
            <p role="status">Loading transcripts…</p>
          ) : error ? (
            <p>Transcripts could not be loaded. Try again using the retry control above.</p>
          ) : (
            <div>
              <h2>Keep the decisions from your meetings</h2>
              <p>
                Upload or paste a transcript to identify decisions and drafting instructions, then
                return here to reopen the work.
              </p>
              <Button variant="primary" onClick={fresh}>
                New transcript
              </Button>
            </div>
          )
        }
      />
    </AppShell>
  );
}
