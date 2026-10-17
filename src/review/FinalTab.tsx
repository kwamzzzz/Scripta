/**
 * Final: the culmination of the review, not a separate document screen.
 *
 * Finalising a contract is a decision, so the tab opens with the pre-flight —
 * what is still unread, undecided or unapplied — and only then offers the four
 * files. The counts are the review's own, so the reviewer signs off on what they
 * can see rather than on a green button.
 */
import { useMemo, useState } from "react";
import { usePersisted } from "@/lib/use-board";
import { Button } from "@/components/primitives";
import { C } from "@/lib/tokens";
import FinalDocument from "@/components/FinalDocument";
import CoverPage from "@/wireframe/CoverPage";
import { readFrontMatterEdits } from "@/lib/export/front-matter";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PreflightList, SignOff } from "@/components/Preflight";
import type { Clause } from "@/data/legal";
import { blocking, preflight } from "./model";
import { schemaFor, schemaForTermKey } from "./schemas";
import { Card, Chip, Eyebrow, Meter, Stat } from "./ui";
import { fmtWhen, plural } from "./format";
import type { Review } from "./use-review";
import { changesIn } from "@/wireframe/tracked-change";

export default function FinalTab({
  review,
  matterId,
  matterName,
  clauses,
  onGoIssues,
  onGoRedline,
  onGoOverview,
}: {
  review: Review;
  matterId: string;
  matterName: string;
  clauses: Clause[];
  onGoIssues: () => void;
  onGoRedline: () => void;
  onGoOverview: () => void;
}) {
  const [checked, setChecked] = useState(false);

  /**
   * The cover page and the preamble, asked about here rather than in Review.
   *
   * Where the title sits on page one and whether the firm's paper is behind it
   * are questions about the copy that goes out, and they were being asked at
   * the top of the review — a blank sheet with a draggable heading, above the
   * clauses, carrying no terms to read. Review is for the words. This is the
   * tab that produces the files, so this is where the front of them belongs.
   */
  const cover = useQuery({
    queryKey: ["cover-page", matterId],
    enabled: !!matterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matters")
        .select("matter_type, client, counterparty, target_date, front_matter")
        .eq("id", matterId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        facts: {
          agreementType:
            (row["matter_type"] as string) && row["matter_type"] !== "Other"
              ? (row["matter_type"] as string)
              : "Agreement",
          client: (row["client"] as string) ?? "",
          counterparty: (row["counterparty"] as string) ?? "",
          date: (row["target_date"] as string) ?? "",
        },
        edits: readFrontMatterEdits(row["front_matter"]),
      };
    },
  });

  /**
   * The front matter the document itself carries, so the cover starts from it.
   * Page one and the preamble are read separately, because they are separate
   * items in the register and separate things on the page.
   */
  const frontText = useMemo(() => {
    const read = (name: string) => {
      const found = clauses.find((c) => (c.num ?? "").trim().toLowerCase() === name);
      if (!found) return undefined;
      const text = found.segs
        .filter((seg) => seg.k !== "d")
        .map((seg) => seg.t)
        .join("")
        .trim();
      return text || undefined;
    };
    return { title: read("title"), preamble: read("preamble") };
  }, [clauses]);
  // Whichever schema the extracted terms belong to, else the one we would guess.
  const firstTerm = review.keyTerms[0];
  const schema =
    (firstTerm ? schemaForTermKey(firstTerm.termKey) : null) ??
    schemaFor(review.matter.matterType, matterName);
  const termGaps = review.keyTerms.length
    ? review.keyTerms.filter((t) => !t.value.trim()).length
    : schema.fields.length;

  const items = preflight(review.progress, review.mandate, termGaps);
  // Tracked changes still waiting: the clean copy leaves them out.
  const outstanding = clauses.reduce((n, c) => n + (c.doc ? changesIn(c.doc).length : 0), 0);
  const blockers = blocking(items);
  const ready = blockers.length === 0;
  /**
   * The checks fold away.
   *
   * On a laptop they fill the screen, and the document — the thing being
   * checked — starts below the fold and has what is left. Reading the list is
   * something a reviewer does once; looking at the pages is what they come
   * back for. Folded or open is remembered, because it is a habit, not a
   * decision about this contract.
   */
  const [shut, setShut] = usePersisted<boolean>("px.final.checks-shut", false);

  return (
    <div className="rv is-final">
      <Card
        className="rv-checks"
        title="Before this goes out"
        hint="What a reviewer would want dealt with before the document leaves the firm. The blocking items are the ones that would make the export misleading."
        right={
          <div className="rv-row">
            {ready ? (
              <Chip tone="ok">Nothing blocking</Chip>
            ) : (
              <Chip tone="high">{plural(blockers.length, "blocker")}</Chip>
            )}
            <button type="button" className="rv-edit-change" onClick={() => setShut(!shut)}>
              {shut ? "Show the checks" : "Hide the checks"}
            </button>
          </div>
        }
      >
        {shut ? (
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
            {review.progress.reviewed}/{review.progress.clauses} clauses assessed ·{" "}
            {plural(review.progress.open, "issue")} open ·{" "}
            {outstanding
              ? `${plural(outstanding, "tracked change")} not accepted`
              : "no tracked changes outstanding"}
            .
          </div>
        ) : (
          <>
            <div className="rv-stats">
              <Stat
                n={`${review.progress.reviewed}/${review.progress.clauses}`}
                label="Clauses assessed"
                tone={review.progress.reviewed === review.progress.clauses ? "ok" : "high"}
                onClick={onGoOverview}
              />
              <Stat
                n={review.progress.open}
                label="Issues open"
                tone={review.progress.open ? "medium" : "ok"}
                onClick={onGoIssues}
              />
              <Stat
                n={review.progress.resolved}
                label="Issues resolved"
                tone="ok"
                onClick={onGoIssues}
              />
              <Stat
                n={review.progress.dismissed}
                label="Issues dismissed"
                tone="quiet"
                onClick={onGoIssues}
              />
              <Stat
                n={review.progress.acceptedAmendments}
                label="Amendments in the document"
                tone="ok"
                onClick={onGoRedline}
              />
              <Stat
                n={outstanding}
                label="Tracked changes not accepted"
                tone={outstanding ? "medium" : "ok"}
                onClick={onGoRedline}
              />
              <Stat
                n={review.progress.pendingAmendments}
                label="Proposals not decided"
                tone={review.progress.pendingAmendments ? "medium" : "ok"}
                onClick={onGoRedline}
              />
            </div>

            <Meter
              fraction={review.progress.fraction}
              label={
                review.mandate.reviewedAt
                  ? `Last read on ${fmtWhen(review.mandate.reviewedAt)}`
                  : "This document has never been read end to end"
              }
              tone={review.progress.fraction === 1 ? C.green : C.accent}
            />

            {outstanding > 0 && (
              <div style={{ fontSize: 12.5, color: C.body, lineHeight: 1.6 }}>
                {plural(outstanding, "tracked change")} not yet accepted. The clean copy leaves them
                out and the marked-up copy shows them struck and underlined; in the marked-up Word
                file they are real Word revisions the other side can accept or reject.{" "}
                <button type="button" className="rv-edit-change" onClick={onGoRedline}>
                  Accept or reject them in Redline →
                </button>
              </div>
            )}

            <PreflightList items={items} />

            <div className="rv-row" style={{ marginTop: 4 }}>
              <SignOff items={items} checked={checked} onChange={setChecked} what="this document" />
            </div>
            {!checked && (
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
                The files below are always available. The tick is the record that somebody looked at
                this list before sending them.
              </div>
            )}
          </>
        )}
      </Card>

      <div className="rv-final-pair">
      {cover.data && (
        <Card
          title="Cover page"
          hint="Where the title sits on page one, and the letterhead behind it, for the Word and PDF copies. The preamble is edited in Review with the rest of the wording."
        >
          <CoverPage
            matterId={matterId}
            facts={cover.data.facts}
            edits={cover.data.edits}
            documentPreamble={frontText.preamble}
            documentTitlePage={frontText.title}
            onSaved={() => void cover.refetch()}
          />
        </Card>
      )}

      <Card
        className="rv-doc"
        title="The document"
        right={
          checked ? (
            <Eyebrow color={C.green}>SIGNED OFF IN THIS SESSION</Eyebrow>
          ) : (
            <Eyebrow>NOT SIGNED OFF</Eyebrow>
          )
        }
        style={{ padding: 0 }}
      >
        {/* The document fills what the checks leave, so the pages are on
            screen without scrolling down to them. */}
        <div style={{ margin: "-12px -14px -14px", display: "flex", flex: 1, minHeight: 0 }}>
          <FinalDocument matterId={matterId} />
        </div>
      </Card>
      </div>


      {clauses.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.65 }}>
          There are no parsed clauses on this matter, so there is nothing to export yet.
        </div>
      )}
    </div>
  );
}
