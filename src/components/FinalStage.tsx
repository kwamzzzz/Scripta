/**
 * The last screen before a document leaves Scripta.
 *
 * Contract Review established the shape: what is still outstanding, a tick
 * recording that a person read it, then the document itself, typeset, beside
 * the buttons that download it. The document is there to be read — a lawyer
 * signs what is on the page, not what an editor says is on the page, and a
 * file that is only ever seen after it has been sent is a file nobody checked.
 *
 * Every drafting tool that can produce a file uses this, so finishing a
 * resolution, a memo and a clause all end the same way.
 */
import type { ReactNode } from "react";
import DocumentPreview, {
  type DownloadFormat,
  type DownloadKind,
} from "@/components/DocumentPreview";
import { PreflightList, SignOff, type PreflightItem } from "@/components/Preflight";
import type { ExportClause } from "@/lib/export/docx";
import "./final-stage.css";

export type FinalDocumentSpec = {
  title: string;
  subtitle?: string | undefined;
  clauses: ExportClause[];
  /** What the parts are called here: clauses, sections, resolutions. */
  unit?: string | undefined;
};

export function FinalCard({
  title,
  hint,
  right,
  children,
  flush,
}: {
  title?: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  /** The document pane fills its card rather than sitting inside padding. */
  flush?: boolean;
}) {
  return (
    <section className="px-final-card">
      {(title || right) && (
        <header className="px-final-head">
          {title && <h2>{title}</h2>}
          <span style={{ flex: 1 }} />
          {right}
        </header>
      )}
      {hint && <p className="px-final-hint">{hint}</p>}
      <div className={flush ? "" : "px-final-body"}>{children}</div>
    </section>
  );
}

export default function FinalStage({
  preflight,
  preflightHint,
  signOff,
  document,
  busy = null,
  error = null,
  onDownload,
  onGoTo,
  actions,
}: {
  preflight: PreflightItem[];
  /** What the check is and is not, in one line. */
  preflightHint?: string;
  signOff?:
    | { checked: boolean; onChange: (value: boolean) => void; what: string }
    | undefined;
  document: FinalDocumentSpec;
  busy?: string | null;
  error?: string | null;
  onDownload: (kind: DownloadKind, format: DownloadFormat) => void;
  /** Jump to what a check is about. */
  onGoTo?: ((item: PreflightItem) => void) | undefined;
  /** Anything the tool wants beside the document's name. */
  actions?: ReactNode;
}) {
  return (
    <div className="px-final">
      <FinalCard
        title="Before this goes out"
        hint={
          preflightHint ??
          "A drafting and completeness check, not legal approval. Scripta has not approved this document."
        }
      >
        <PreflightList items={preflight} {...(onGoTo ? { onGo: onGoTo } : {})} />
        {signOff && (
          <>
            <SignOff
              items={preflight}
              checked={signOff.checked}
              onChange={signOff.onChange}
              what={signOff.what}
            />
            {!signOff.checked && (
              <div className="px-final-note">
                The files below are always available. The tick is the record that somebody looked
                at this list before sending them.
              </div>
            )}
          </>
        )}
      </FinalCard>

      <FinalCard
        title="The document"
        hint="Read it here before it goes. The preview and the download are built from one reading, so they cannot disagree."
        right={actions}
        flush
      >
        <DocumentPreview
          title={document.title}
          {...(document.subtitle ? { subtitle: document.subtitle } : {})}
          clauses={document.clauses}
          {...(document.unit ? { unit: document.unit } : {})}
          busy={busy}
          error={error}
          onDownload={onDownload}
        />
      </FinalCard>
    </div>
  );
}
