/**
 * The review run: the passes in order, each saved as it finishes.
 *
 *   1. Exact checks (no AI): references, figures and tables, contents,
 *      citations against the bibliography, the style sheet, mechanics.
 *   2. Chapter reviews: each target chapter read whole into its summary,
 *      assessment and facts. Chapters outside the target are summarised too
 *      if they have not been, because they are the context the target is read
 *      against — but their issues are not kept.
 *   3. Proofreading, a passage at a time, with the chapter's summary beside it.
 *   4. The manuscript map and its structural issues.
 *   5. The chapters read against each other.
 *
 * Review scope is not context scope: reviewing Chapter 7 still reads Chapter 2.
 *
 * A failure part-way keeps everything saved before it. Nothing is retried on
 * a second provider; a paused or unfunded AI stops the run with its reason.
 */
import { runChecks } from "./checks";
import {
  chapterState,
  db,
  loadFindings,
  loadManuscript,
  loadNodes,
  proposeRules,
  saveFindings,
  setChapterState,
  startRun,
  updateRun,
  type Chapter,
  type Finding,
  type StoredNode,
} from "./db";
import { crossChapterReview, mapManuscript, proofreadPassage, reviewChapter } from "./functions";
import { groupCorrections } from "./dedupe";
import { sentenceOf, splitSentences } from "./sentences";
import {
  hash,
  passesFor,
  wordCount,
  type ChapterSummary,
  type DraftFinding,
  type ReviewPass,
  type ReviewScope,
} from "./model";

export type RunProgress = { step: string; done: number; of: number };

/** A row as Supabase returns it: the generated types do not know these tables. */
type Row = any;

const PROSE = new Set([
  "front",
  "chapter",
  "heading",
  "paragraph",
  "quote",
  "list_item",
  "caption",
  "footnote",
  "endnote",
]);
const BIBLIO = /^(references|bibliography|works cited|reference list|sources)$/i;
const PASSAGE_WORDS = 1400;

/** Runs of prose no longer than a passage, never crossing a chapter. */
export function passages(nodes: StoredNode[], chapterKeys: Set<string | null>): StoredNode[][] {
  const out: StoredNode[][] = [];
  let run: StoredNode[] = [];
  let words = 0;
  let chapter: string | null | undefined;
  const flush = () => {
    if (run.length) out.push(run);
    run = [];
    words = 0;
  };
  for (const n of nodes) {
    if (!PROSE.has(n.kind) || !n.text.trim() || !chapterKeys.has(n.chapterKey)) continue;
    if (n.chapterKey !== chapter) flush();
    chapter = n.chapterKey;
    const w = wordCount(n.text);
    if (words + w > PASSAGE_WORDS && run.length) flush();
    run.push(n);
    words += w;
  }
  flush();
  return out;
}

const chapterLine = (c: Chapter) =>
  `${[c.number, c.title].filter(Boolean).join(" ")}: ${c.summary?.summary ?? "(not yet read)"}`;

const chapterContext = (c: Chapter | undefined) =>
  c?.summary ? `${c.title}. Purpose: ${c.summary.purpose}. ${c.summary.summary}` : "";

const textOf = (nodes: StoredNode[], keys: Set<string | null>, max: number) => {
  let out = "";
  for (const n of nodes) {
    if (!keys.has(n.chapterKey) && !(keys.has(n.key) && n.kind === "chapter")) continue;
    if (!PROSE.has(n.kind)) continue;
    out += `${n.text}\n`;
    if (out.length > max) break;
  }
  return out.slice(0, max);
};

/**
 * A chapter with no prose of its own — the bibliography, a list of cases —
 * is checked by the exact checks and not read by a model: there is nothing to
 * summarise and nothing to proofread.
 */
const isApparatus = (c: Chapter, nodes: StoredNode[]) =>
  BIBLIO.test(c.title.trim()) ||
  !nodes.some(
    (n) =>
      n.chapterKey === c.chapterKey &&
      n.kind !== "chapter" &&
      n.kind !== "bibliography_entry" &&
      n.kind !== "toc_entry" &&
      n.text.trim(),
  );

/** The chapters that make the argument: not the bibliography, not appendices. */
const bodyChapters = (chapters: Chapter[]) =>
  chapters.filter((c) => !BIBLIO.test(c.title.trim()) && !/^appendix\b/i.test(c.title.trim()));

/**
 * The exact checks are deterministic: run on the same text with the same
 * style sheet they raise the same findings. So an open finding of theirs that
 * a new run no longer raises is out of date — the words changed, or the author
 * settled the question on the style sheet (a spelling query becomes a
 * correction once a spelling is adopted). It is marked resolved with the
 * reason. Only open rule findings inside this run's scope and passes; nothing
 * a person decided and nothing a reader raised is touched.
 */
async function retireStale(args: {
  findings: Finding[];
  current: Set<string>;
  passes: ReviewPass[];
  target: string[] | null;
}) {
  const stale = args.findings.filter(
    (f) =>
      f.source === "rule" &&
      f.status === "open" &&
      args.passes.includes(f.pass) &&
      !args.current.has(f.fingerprint) &&
      (!args.target || f.chapterKeys.some((k) => args.target!.includes(k))),
  );
  if (!stale.length) return;
  const { error } = await db
    .from("manuscript_findings")
    .update({
      status: "resolved",
      decision_note: "No longer raised: the text or the style sheet has changed since.",
      decided_at: new Date().toISOString(),
    })
    .in(
      "id",
      stale.map((f) => f.id),
    );
  if (error) throw new Error(error.message);
}

type Ctl = { cancelled: () => boolean; onProgress: (p: RunProgress) => void };

class Cancelled extends Error {}

export async function runReview(args: {
  manuscriptId: string;
  scope: ReviewScope;
  chapterKeys: string[];
  ctl: Ctl;
}): Promise<{ added: number }> {
  const bundle = await loadManuscript(args.manuscriptId);
  const { manuscript, version } = bundle;
  if (!version) throw new Error("Upload the manuscript before reviewing it.");
  const passes = passesFor(args.scope);
  const allKeys = bundle.chapters.map((c) => c.chapterKey);
  const target =
    args.scope === "chapters" ? args.chapterKeys.filter((k) => allKeys.includes(k)) : null;
  if (args.scope === "chapters" && !target?.length) throw new Error("Choose at least one chapter.");
  const targetKeys = target ?? allKeys;
  const runId = await startRun({
    manuscriptId: manuscript.id,
    versionId: version.id,
    scope: args.scope,
    chapterKeys: target ?? [],
    passes,
  });
  let added = 0;
  const step = async (name: string, done: number, of: number) => {
    if (args.ctl.cancelled()) throw new Cancelled();
    const p = { step: name, done, of };
    args.ctl.onProgress(p);
    await updateRun(runId, { progress: p });
  };
  const keep = (drafts: DraftFinding[]) =>
    saveFindings({
      manuscriptId: manuscript.id,
      versionId: version.id,
      drafts,
      nodes: bundle.nodes,
    }).then((n) => {
      added += n;
    });

  try {
    await setChapterState(version.id, targetKeys, "reviewing");

    // 1. Exact checks.
    await step("Exact checks", 0, 1);
    const checked = runChecks({
      nodes: bundle.nodes,
      rules: bundle.rules,
      targetChapterKeys: target,
      format: version.format,
    });
    const exact = checked.findings.filter((f) => passes.includes(f.pass));
    await retireStale({
      findings: bundle.findings,
      current: new Set(exact.map((f) => f.fingerprint)),
      passes,
      target,
    });
    await keep(exact);
    await proposeRules(manuscript.id, bundle.rules, checked.detectedRules);

    // 2. Chapter reviews (and context for the rest).
    const needsReading = passes.includes("coherence") || passes.includes("consistency");
    const chapters = new Map(bundle.chapters.map((c) => [c.chapterKey, c]));
    if (needsReading) {
      const toRead = bundle.chapters.filter(
        (c) => (targetKeys.includes(c.chapterKey) || !c.summary) && !isApparatus(c, bundle.nodes),
      );
      for (const [i, c] of toRead.entries()) {
        await step(`Reading ${c.title || "chapter"}`, i, toRead.length);
        const context = bundle.chapters
          .filter((o) => o.chapterKey !== c.chapterKey && chapters.get(o.chapterKey)?.summary)
          .map((o) => chapterLine(chapters.get(o.chapterKey)!))
          .join("\n")
          .slice(0, 20_000);
        const out = await reviewChapter({
          data: {
            manuscriptId: manuscript.id,
            versionId: version.id,
            chapterKey: c.chapterKey,
            context,
          },
        });
        chapters.set(c.chapterKey, {
          ...c,
          summary: out.summary as ChapterSummary,
          assessment: out.assessment,
        });
        if (targetKeys.includes(c.chapterKey)) await keep(out.findings);
      }
    }

    // 3. Proofreading.
    if (passes.includes("mechanics")) {
      const scopeKeys = new Set<string | null>(
        targetKeys.filter((k) => {
          const c = chapters.get(k);
          return !c || !isApparatus(c, bundle.nodes);
        }),
      );
      if (!target) scopeKeys.add(null); // front matter: abstract, acknowledgements
      const runs = passages(bundle.nodes, scopeKeys);
      // A chapter's corrections are saved together, so the same fix made in
      // thirty places becomes one finding listing them.
      let pending: DraftFinding[] = [];
      let pendingChapter: string | null = null;
      const flush = async () => {
        if (pending.length) await keep(groupCorrections(pending, pendingChapter ?? "front"));
        pending = [];
      };
      for (const [i, run] of runs.entries()) {
        const chapterKey = run[0]!.chapterKey;
        if (chapterKey !== pendingChapter) {
          await flush();
          pendingChapter = chapterKey;
        }
        const c = chapterKey ? chapters.get(chapterKey) : undefined;
        await step(`Proofreading ${c?.title ?? "front matter"}`, i, runs.length);
        const out = await proofreadPassage({
          data: {
            manuscriptId: manuscript.id,
            versionId: version.id,
            nodeKeys: run.map((n) => n.key),
            chapterContext: chapterContext(c),
          },
        });
        pending.push(...out.findings);
      }
      await flush();
    }

    // 4. The map.
    if (passes.includes("coherence")) {
      await step("Mapping the argument", 0, 1);
      const body = bodyChapters([...chapters.values()]);
      const first = body[0];
      const last = body[body.length - 1];
      const opening =
        textOf(bundle.nodes, new Set([null]), 12_000) +
        (first ? textOf(bundle.nodes, new Set([first.chapterKey]), 12_000) : "");
      const closing = last ? textOf(bundle.nodes, new Set([last.chapterKey]), 24_000) : "";
      const out = await mapManuscript({
        data: {
          manuscriptId: manuscript.id,
          versionId: version.id,
          targetChapterKeys: target,
          opening,
          closing,
        },
      });
      await keep(out.findings);
    }

    // 5. Across chapters.
    if (passes.includes("consistency")) {
      await step("Reading chapters against each other", 0, 1);
      const out = await crossChapterReview({
        data: { manuscriptId: manuscript.id, versionId: version.id, targetChapterKeys: target },
      });
      await keep(out.findings);
    }

    await setChapterState(version.id, targetKeys, "reviewed");
    await updateRun(runId, { status: "done", progress: { step: "Done", done: 1, of: 1 } });
    return { added };
  } catch (cause) {
    const cancelled = cause instanceof Cancelled;
    await setChapterState(version.id, targetKeys, "not_reviewed").catch(() => {});
    await updateRun(runId, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? null : cause instanceof Error ? cause.message : String(cause),
    });
    if (cancelled) return { added };
    throw cause;
  }
}

/* ---------------------------------------------------------- verification -- */

/**
 * After the author's amendments: carry every finding from the last version
 * onto this one, say whether it survived, then read what changed.
 *
 *   remains     the words it rests on are still there (its decision stands)
 *   fixed       they are gone, so it is marked resolved
 *   introduced  new on this version: raised on changed text, or by a check
 *               that did not fire before
 *
 * "We fixed 438 findings, therefore the book is clean" is exactly what this
 * pass exists to test.
 */
export async function verifyVersion(args: {
  manuscriptId: string;
  previousVersionId: string;
  ctl: Ctl;
}): Promise<{ remains: number; fixed: number; introduced: number }> {
  const bundle = await loadManuscript(args.manuscriptId);
  const version = bundle.version;
  if (!version || version.id === args.previousVersionId)
    throw new Error("There is no newer version to verify.");
  const runId = await startRun({
    manuscriptId: args.manuscriptId,
    versionId: version.id,
    scope: "verification",
    chapterKeys: [],
    passes: ["verification"],
  });
  const step = async (name: string, done: number, of: number) => {
    if (args.ctl.cancelled()) throw new Cancelled();
    const p = { step: name, done, of };
    args.ctl.onProgress(p);
    await updateRun(runId, { progress: p });
  };

  try {
    await step("Comparing versions", 0, 1);
    const [oldNodes, oldFindings] = await Promise.all([
      loadNodes(args.previousVersionId),
      loadFindings(args.previousVersionId),
    ]);
    const newNodes = bundle.nodes;
    const newByHash = new Map<string, StoredNode>();
    for (const n of newNodes) if (!newByHash.has(hash(n.text))) newByHash.set(hash(n.text), n);
    const oldText = new Map(oldNodes.map((n) => [n.key, n.text]));
    const oldHashes = new Set(oldNodes.map((n) => hash(n.text)));
    // What changed, sentence by sentence: a sentence is new if its exact words
    // are nowhere in the last version, so an edit to one sentence does not
    // mark the rest of its paragraph as changed.
    const oldSentences = new Set(
      oldNodes.flatMap((n) => splitSentences(n.text).map((x) => hash(x.text))),
    );
    const changedSentences = new Set<string>();
    for (const n of newNodes)
      if (n.text.trim() && !oldHashes.has(hash(n.text)))
        for (const x of splitSentences(n.text))
          if (!oldSentences.has(hash(x.text))) changedSentences.add(`${n.key}.${x.n}`);
    const changed = newNodes.filter((n) =>
      [...changedSentences].some((k) => k.startsWith(`${n.key}.`)),
    );
    const findNode = (quote: string) => newNodes.find((n) => n.text.includes(quote));

    // Carry the old findings across.
    const already = new Set(bundle.findings.map((f) => f.fingerprint));
    let ref = bundle.findings.reduce((m, f) => Math.max(m, f.ref), 0);
    let remains = 0;
    let fixed = 0;
    const carried: Row[] = [];
    for (const f of oldFindings) {
      if (f.status === "resolved" || already.has(f.fingerprint)) continue;
      const quotes = [f.original, ...f.evidence.map((e) => e.quote)].filter(
        (q): q is string => !!q && q.trim().length > 0,
      );
      const evidence = f.evidence
        .map((e) => {
          const same = newByHash.get(hash(oldText.get(e.nodeKey) ?? ""));
          const moved = !same && e.quote ? findNode(e.quote) : undefined;
          const at = same ?? moved;
          if (!at) return null;
          const { sentence: _old, ...rest } = e;
          void _old;
          // A quote finds its sentence again; with no quote, an unchanged
          // paragraph keeps the sentence it had (its sentences are the same).
          const sentence = e.quote ? sentenceOf(at.text, e.quote) : same ? e.sentence : undefined;
          return { ...rest, nodeKey: at.key, ...(sentence ? { sentence } : {}) };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
      const stillThere = quotes.length
        ? quotes.some((q) => newNodes.some((n) => n.text.includes(q)))
        : evidence.length > 0;
      const passagesChanged =
        !quotes.length &&
        f.evidence.some((e) => !newByHash.has(hash(oldText.get(e.nodeKey) ?? "")));
      if (stillThere) remains++;
      else fixed++;
      const chapterKeys = [
        ...new Set(
          evidence
            .map((e) => newNodes.find((n) => n.key === e.nodeKey)?.chapterKey)
            .filter((k): k is string => !!k),
        ),
      ];
      carried.push({
        manuscript_id: args.manuscriptId,
        version_id: version.id,
        ref: ++ref,
        pass: f.pass,
        category: f.category,
        severity: f.severity,
        action: f.action,
        title: f.title,
        body:
          passagesChanged && stillThere
            ? `${f.body} (The passages this rests on have changed since it was raised; check whether it still applies.)`
            : f.body,
        original: f.original,
        replacement: f.replacement,
        evidence,
        chapter_keys: chapterKeys,
        fingerprint: f.fingerprint,
        source: f.source,
        rule_id: f.ruleId,
        status: stillThere ? f.status : "resolved",
        decision_note: stillThere ? f.decisionNote : "No longer in the text of this version.",
        decided_at: stillThere ? f.decidedAt : new Date().toISOString(),
        carried_from: f.id,
        verification: stillThere ? "remains" : "fixed",
      });
    }
    for (let i = 0; i < carried.length; i += 500) {
      const { error } = await db.from("manuscript_findings").insert(carried.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    // Chapters whose text did not change keep their reading.
    const { data: oldChapters } = await db
      .from("manuscript_chapters")
      .select("*")
      .eq("version_id", args.previousVersionId);
    const chapterHash = (
      nodes: StoredNode[] | { chapterKey: string | null; text: string }[],
      key: string,
    ) =>
      hash(
        nodes
          .filter((n) => n.chapterKey === key)
          .map((n) => n.text)
          .join("\n"),
      );
    const changedChapters: string[] = [];
    for (const c of bundle.chapters) {
      const old = ((oldChapters ?? []) as Row[]).find(
        (o) => String(o.title).trim().toLowerCase() === c.title.trim().toLowerCase(),
      );
      const same =
        old &&
        chapterHash(oldNodes, String(old.chapter_key)) === chapterHash(newNodes, c.chapterKey);
      if (old?.summary) {
        await db
          .from("manuscript_chapters")
          .update({
            summary: same
              ? old.summary
              : remapSummary(old.summary as ChapterSummary, oldText, newByHash),
            assessment: old.assessment ?? null,
            summarised_at: old.summarised_at ?? null,
            state: same ? chapterState(old.state) : "not_reviewed",
            reviewed_at: same ? (old.reviewed_at ?? null) : null,
          })
          .eq("id", c.id);
      }
      if (!same) changedChapters.push(c.chapterKey);
    }

    // Read what changed.
    const before = new Set([...already, ...carried.map((c) => String(c.fingerprint))]);
    const introduced = (d: DraftFinding) => ({
      verification: before.has(d.fingerprint) ? null : "introduced",
    });
    const keep = (drafts: DraftFinding[]) =>
      saveFindings({
        manuscriptId: args.manuscriptId,
        versionId: version.id,
        drafts,
        nodes: newNodes,
        extra: introduced,
      });

    const fresh = await loadManuscript(args.manuscriptId);
    await step("Exact checks", 0, 1);
    const checked = runChecks({
      nodes: newNodes,
      rules: fresh.rules,
      targetChapterKeys: null,
      format: version.format,
    });
    let introducedCount = 0;
    introducedCount += await keep(checked.findings);

    const changedKeys = new Set(changed.map((n) => n.key));
    const runs = passages(newNodes, new Set([null, ...fresh.chapters.map((c) => c.chapterKey)]))
      .map((run) => run.filter((n) => changedKeys.has(n.key)))
      .filter((run) => run.length > 0);
    for (const [i, run] of runs.entries()) {
      const c = fresh.chapters.find((ch) => ch.chapterKey === run[0]!.chapterKey);
      await step("Proofreading what changed", i, runs.length);
      const out = await proofreadPassage({
        data: {
          manuscriptId: args.manuscriptId,
          versionId: version.id,
          nodeKeys: run.map((n) => n.key),
          chapterContext: chapterContext(c),
          onlySentences: [...changedSentences].filter((k) =>
            run.some((n) => k.startsWith(`${n.key}.`)),
          ),
        },
      });
      introducedCount += await keep(groupCorrections(out.findings, c?.chapterKey ?? "front"));
    }

    for (const [i, key] of changedChapters.entries()) {
      const c = fresh.chapters.find((ch) => ch.chapterKey === key);
      if (!c) continue;
      await step(`Re-reading ${c.title}`, i, changedChapters.length);
      const out = await reviewChapter({
        data: {
          manuscriptId: args.manuscriptId,
          versionId: version.id,
          chapterKey: key,
          context: fresh.chapters
            .filter((o) => o.chapterKey !== key && o.summary)
            .map(chapterLine)
            .join("\n")
            .slice(0, 20_000),
        },
      });
      introducedCount += await keep(out.findings);
    }
    if (changedChapters.length) {
      await step("Reading changed chapters against the rest", 0, 1);
      const out = await crossChapterReview({
        data: {
          manuscriptId: args.manuscriptId,
          versionId: version.id,
          targetChapterKeys: changedChapters,
        },
      });
      introducedCount += await keep(out.findings);
      await setChapterState(version.id, changedChapters, "reviewed");
    }

    await db
      .from("manuscript_versions")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", version.id);
    await updateRun(runId, { status: "done", progress: { step: "Done", done: 1, of: 1 } });
    return { remains, fixed, introduced: introducedCount };
  } catch (cause) {
    const cancelled = cause instanceof Cancelled;
    await updateRun(runId, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? null : cause instanceof Error ? cause.message : String(cause),
    });
    if (cancelled) return { remains: 0, fixed: 0, introduced: 0 };
    throw cause;
  }
}

/** A summary's facts point at atoms; carried to a new version, they follow their text. */
function remapSummary(
  s: ChapterSummary,
  oldText: Map<string, string>,
  newByHash: Map<string, StoredNode>,
): ChapterSummary {
  return {
    ...s,
    facts: (s.facts ?? [])
      .map((f) => {
        const at = newByHash.get(hash(oldText.get(f.nodeKey) ?? ""));
        return at ? { ...f, nodeKey: at.key } : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  };
}
