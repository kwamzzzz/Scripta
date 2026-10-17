/**
 * Taking the playbook out of Scripta.
 *
 * A firm's positions get used where this product is not: on a call with a
 * client, in a Word document somebody is drafting by hand, in the folder that
 * answers "what did we say in 2026". So the export is not a nicety — it is what
 * makes recording a playbook here worth doing at all for a firm that does not
 * run every negotiation through this screen.
 *
 * Offered on one position as well as the whole, because "what do we say about
 * liability" is the question asked on a call, and the answer should be a page.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { exportPlaybook } from "@/lib/playbook/export.functions";
import { downloadBytes, DOCX_MIME } from "@/lib/export/download";
import { C } from "@/lib/tokens";

export default function PlaybookExport({
  playbookId,
  ruleIds,
  label = "Export",
}: {
  playbookId: string;
  /** Omit for the whole playbook; pass one id to take a single position. */
  ruleIds?: string[] | undefined;
  label?: string;
}) {
  const run = useServerFn(exportPlaybook);
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const take = async (format: "docx" | "pdf") => {
    setBusy(format);
    setProblem(null);
    try {
      const file = await run({ data: { playbookId, format, ...(ruleIds ? { ruleIds } : {}) } });
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      downloadBytes(bytes, file.filename, file.mime ?? DOCX_MIME);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "That could not be exported.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.secondary }}>
        <Download size={13} aria-hidden="true" />
        <span style={{ fontSize: 12.5 }}>{label}</span>
      </span>
      <button
        type="button"
        className="playbook-export-choice"
        disabled={busy !== null}
        onClick={() => void take("docx")}
      >
        {busy === "docx" ? "Preparing…" : "Word"}
      </button>
      <button
        type="button"
        className="playbook-export-choice"
        disabled={busy !== null}
        onClick={() => void take("pdf")}
      >
        {busy === "pdf" ? "Preparing…" : "PDF"}
      </button>
      {problem && (
        <span role="alert" style={{ color: C.red, fontSize: 12 }}>
          {problem}
        </span>
      )}
    </span>
  );
}
