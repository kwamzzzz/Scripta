import { C } from "@/lib/tokens";

/**
 * Say that a read failed, rather than that there is nothing there.
 *
 * Every list in this app had the same shape: fetch, fall back to an empty
 * array, render "No matters yet". So an unreachable table and an empty
 * workspace looked identical — and the empty-state wording is reassuring, which
 * is the worst thing to show someone whose data has not loaded. A lawyer who
 * is told there are no tasks stops looking for the ones waiting on them.
 */
export default function LoadError({
  what,
  error,
  onRetry,
}: {
  /** What could not be read, in the plural: "matters", "tasks", "documents". */
  what: string;
  error: Error | null;
  onRetry?: (() => void) | undefined;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        margin: "12px 20px",
        padding: "11px 14px",
        border: "1px solid #E8CCC7",
        background: "#F7ECEA",
        borderRadius: 8,
        color: C.red,
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        Your {what} could not be loaded, so this is not a list of what you have.{" "}
        <span style={{ color: "#8a4a44" }}>{error.message}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            flex: "none",
            border: `1px solid #E8CCC7`,
            background: "#fff",
            borderRadius: 6,
            padding: "4px 10px",
            color: C.red,
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
