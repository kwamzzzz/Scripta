/**
 * The dated history of a chart: the latest change, and the rest on request.
 * Each change carries the date it took effect and what records it, where the
 * writer gave them, beside who recorded it and when.
 */
import { useState } from "react";
import { formatDay, type ChangeEvent } from "../model";
import { LinkButton, Panel } from "../ui";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Line({ event }: { event: ChangeEvent }) {
  const dated = [
    event.effectiveOn ? `effective ${formatDay(event.effectiveOn)}` : "",
    event.reference ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <span>
        {event.summary}
        {dated ? ` — ${dated}` : ""}
      </span>
      <small>
        {event.actor || "Someone"} · {when(event.at)}
      </small>
    </li>
  );
}

export default function History({
  title,
  events,
  empty,
}: {
  title: string;
  events: ChangeEvent[];
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const [latest, ...rest] = events;
  return (
    <Panel
      title={title}
      right={
        rest.length ? (
          <LinkButton onClick={() => setOpen((v) => !v)}>
            {open ? "Hide history" : `View change history (${events.length})`}
          </LinkButton>
        ) : undefined
      }
    >
      {!latest ? (
        <p className="og-muted" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul className="oc-history">
          <Line event={latest} />
          {open && rest.slice(0, 60).map((e) => <Line key={e.id} event={e} />)}
        </ul>
      )}
    </Panel>
  );
}
