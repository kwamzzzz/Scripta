/**
 * The compliance calendar as an iCalendar file (RFC 5545).
 *
 * A download, not a subscription: Scripta has no public feed endpoint, and a
 * calendar URL that anyone holding it could read would put a client's filing
 * dates outside the firm's access rules. Re-download to refresh.
 *
 * Every event is all-day, with a UID built from the record and the date, so
 * importing a newer copy updates events rather than duplicating them.
 */
import {
  addDays,
  entityLabel,
  formatDay,
  localDay,
  occurrencesBetween,
  ownerLabel,
  type Day,
  type Organisation,
} from "./model";

export const ICS_MONTHS = 18;

/** Escape TEXT values: backslash, semicolon, comma and newlines. */
export const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold a content line at 75 octets, continuing with CRLF + space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  const limit = () => (out.length === 0 ? 75 : 74);
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > limit()) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compact = (day: Day) => day.replace(/-/g, "");

export type IcsEvent = { uid: string; day: Day; summary: string; description: string };

export function buildIcs(
  calendarName: string,
  events: IcsEvent[],
  stamp: Date = new Date(),
): string {
  const dtstamp = stamp
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Scripta//Compliance calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(e.day)}`,
      `DTEND;VALUE=DATE:${compact(addDays(e.day, 1))}`,
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Occurrences and licence expiries from today for the next eighteen months. */
export function organisationIcs(
  org: Organisation,
  clientName: string,
  today: Day = localDay(),
): string {
  const to = addDays(today, ICS_MONTHS * 31);
  const entity = (id: string | null) =>
    id ? entityLabel(org.entities.find((e) => e.id === id)) : "";
  const events: IcsEvent[] = [];
  for (const o of occurrencesBetween(org, today, to, today)) {
    if (o.state === "done" || o.state === "waived") continue;
    const who = ownerLabel(org, o.obligation);
    events.push({
      uid: `obligation-${o.obligation.id}-${compact(o.dueOn)}@scripta`,
      day: o.dueOn,
      summary: `${o.obligation.title}${entity(o.obligation.entityId) ? ` — ${entity(o.obligation.entityId)}` : ""}`,
      description: [clientName, who ? `Owner: ${who}` : "", o.obligation.penaltyNote]
        .filter(Boolean)
        .join("\n"),
    });
  }
  for (const l of org.licences) {
    if (l.archivedAt || !l.expiresOn || l.expiresOn < today || l.expiresOn > to) continue;
    events.push({
      uid: `licence-${l.id}-${compact(l.expiresOn)}@scripta`,
      day: l.expiresOn,
      summary: `${l.name} expires${entity(l.entityId) ? ` — ${entity(l.entityId)}` : ""}`,
      description: [
        clientName,
        l.authority ? `Authority: ${l.authority}` : "",
        `Renewal window opens ${formatDay(addDays(l.expiresOn, -l.renewalLeadDays))}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }
  return buildIcs(
    `${clientName} — compliance`,
    events.sort((a, b) => a.day.localeCompare(b.day)),
  );
}
