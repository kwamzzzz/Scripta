/**
 * The check before a document leaves.
 *
 * Contract Review established this: before finalising, the reviewer sees every
 * check that was run — the ones that passed as well as the ones that did not —
 * and ticks to record that a person looked at the list. Corporate Drafting
 * needs the same thing for a resolution, so it is the same component, the same
 * words and the same marks rather than a second thing that resembles it.
 *
 * A cleared check is stated, not hidden. An empty list says nothing about
 * whether anything was checked; "No critical issues are open" says a great
 * deal.
 */
import { AlertTriangle, Check, CircleAlert } from "lucide-react";
import { C } from "@/lib/tokens";
import "./preflight.css";

export type PreflightItem = {
  key: string;
  label: string;
  detail: string;
  count: number;
  /** blocking items should stop the lawyer; warnings are theirs to weigh. */
  level: "blocking" | "warning" | "clear";
  /** Where in the document this is about, when it is about one place. */
  anchorId?: string;
};

export const blocking = (items: PreflightItem[]) => items.filter((i) => i.level === "blocking");
export const warnings = (items: PreflightItem[]) => items.filter((i) => i.level === "warning");

/** "2 to fix · 1 to weigh", or that nothing is outstanding. */
export function preflightSummary(items: PreflightItem[]): string {
  const stop = blocking(items).length;
  const weigh = warnings(items).length;
  if (!stop && !weigh) return "Nothing outstanding.";
  return [stop ? `${stop} to fix` : null, weigh ? `${weigh} to weigh` : null]
    .filter(Boolean)
    .join(" · ");
}

export function PreflightList({
  items,
  onGo,
}: {
  items: PreflightItem[];
  /** Jump to what a check is about, where it is about one place. */
  onGo?: (item: PreflightItem) => void;
}) {
  return (
    <div>
      {items.map((item) => {
        const go = item.anchorId && onGo ? () => onGo(item) : undefined;
        const Row = go ? "button" : "div";
        return (
          <Row
            key={item.key}
            {...(go ? { type: "button" as const, onClick: go, className: "px-pre is-link" } : { className: "px-pre" })}
          >
            <span className="px-pre-mark">
              {item.level === "clear" ? (
                <Check size={14} strokeWidth={2.2} color={C.green} />
              ) : item.level === "blocking" ? (
                <CircleAlert size={14} strokeWidth={2} color={C.red} />
              ) : (
                <AlertTriangle size={14} strokeWidth={2} color={C.amber} />
              )}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="px-pre-label">
                {item.label}
                {item.count > 0 && item.level !== "clear" && (
                  <span style={{ color: C.muted, fontWeight: 400 }}> · {item.count}</span>
                )}
              </div>
              <div className="px-pre-detail">{item.detail}</div>
            </div>
          </Row>
        );
      })}
    </div>
  );
}

/**
 * The tick that records a person read the list. It never blocks the files:
 * finalising is a decision, and the record is that somebody made it knowingly.
 */
export function SignOff({
  items,
  checked,
  onChange,
  what,
}: {
  items: PreflightItem[];
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** "this document", "this resolution". */
  what: string;
}) {
  const stop = blocking(items);
  return (
    <label className="px-pre-signoff">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I have read the pre-flight above and I am finalising {what} as it stands
        {stop.length > 0 ? `, including ${stop.map((b) => b.label.toLowerCase()).join(" and ")}.` : "."}
      </span>
    </label>
  );
}
