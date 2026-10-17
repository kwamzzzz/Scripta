import { C } from "@/lib/tokens";

/**
 * The thing you just chose did not happen.
 *
 * Distinct from LoadError, which says a list could not be read. This says an
 * action a lawyer deliberately took — delete, archive, re-parse — was refused
 * or failed. Both matter, but this one matters more: nobody chose to load a
 * list, and everybody chooses to delete something.
 *
 * These were all launched with a bare `void` and no catch, so a refusal became
 * an unhandled promise rejection and the row simply stayed where it was. A
 * delete that silently does nothing looks exactly like a delete you did not
 * press.
 */
export default function ActionError({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        margin: "10px 20px 0",
        padding: "9px 12px",
        border: "1px solid #E8CCC7",
        background: "#F7ECEA",
        borderRadius: 8,
        color: C.red,
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          flex: "none",
          border: 0,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Run an action, and say so plainly when it does not work. */
export async function attempt(
  what: string,
  run: () => Promise<unknown>,
  report: (message: string) => void,
): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (cause) {
    report(`${what} ${cause instanceof Error ? `— ${cause.message}` : "did not work."}`);
    return false;
  }
}
