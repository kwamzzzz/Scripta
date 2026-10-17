/**
 * Starting a research matter.
 *
 * Two fields and a button. Everything else Scripta can infer from the words —
 * "under UAE law" says the jurisdiction, "advise whether" says the output — and
 * what it infers is shown on the Brief tab where the lawyer can correct it.
 * Six configuration pages before anything happens is how a tool teaches people
 * to dread using it.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import { useApp } from "@/store/app";
import { useCreateResearch } from "@/lib/research-data";
import { saveResearchRecords, saveResearchState } from "@/lib/research-store.functions";
import { withRecordDefaults } from "@/wireframe/research-matter";
import { emptyResearch } from "@/wireframe/research-store";
import { draftBrief } from "./functions";
import {
  DEPTHS,
  emptyFact,
  emptyQuestion,
  FACT_CLASSES,
  JURISDICTIONS,
  OUTPUT_KINDS,
  renumberQuestions,
} from "./model";
import { Card, Field, Select, Working } from "./ui";
import "./research.css";

export default function ResearchIntake({ matterId = null }: { matterId?: string | null } = {}) {
  const navigate = useNavigate();
  const create = useCreateResearch();
  const [instructions, setInstructions] = useState("");
  const [facts, setFacts] = useState("");
  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [areaOfLaw, setAreaOfLaw] = useState("");
  const [lawAsAt, setLawAsAt] = useState("");
  const [outputKind, setOutputKind] = useState("Research memorandum");
  const [depth, setDepth] = useState("Standard");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const start = async (withBrief: boolean) => {
    setProblem(null);
    setBusy(withBrief ? "Reading the instructions…" : "Opening the matter…");
    try {
      const drafted = withBrief
        ? await draftBrief({
            data: {
              instructions,
              facts,
              jurisdiction,
              existingQuestions: [],
              matterId: matterId ?? null,
            },
          })
        : null;
      if (drafted && !drafted.ok) {
        setProblem(`${drafted.error} You can still open the matter and work without the draft.`);
        setBusy(null);
        return;
      }
      const brief = drafted?.ok ? drafted.brief : null;
      setBusy("Opening the matter…");
      const name =
        title.trim() ||
        instructions.trim().split(/[.\n]/)[0]?.slice(0, 70).trim() ||
        "Untitled research";
      const id = await create("comprehensive", name, matterId);

      const state = {
        ...emptyResearch(name),
        jurisdiction: jurisdiction || brief?.jurisdiction || "",
        areaOfLaw: areaOfLaw || brief?.areaOfLaw || "",
        lawAsAt,
        outputKind: outputKind || brief?.outputKind || "Research memorandum",
        depth,
        memo: { ...emptyResearch(name).memo, title: name },
      };
      const base = withRecordDefaults(undefined);
      const records = {
        ...base,
        instructions,
        plan: brief?.plan ?? base.plan,
        issueCards: renumberQuestions(
          (brief?.questions ?? []).map((q, i) => ({
            ...emptyQuestion(i, state.jurisdiction),
            short: q.short,
            q: q.question,
            pri: q.priority,
          })),
        ),
        // Without the brief nothing has broken the narrative into separate
        // facts, so it is kept whole rather than thrown away. The lawyer can
        // split it on the Brief tab.
        factRows: brief
          ? brief.facts.map((f, i) => ({
              ...emptyFact(i),
              fact: f.fact,
              cls: FACT_CLASSES.includes(f.classification) ? f.classification : "Client-provided",
            }))
          : facts.trim()
            ? [{ ...emptyFact(0), fact: facts.trim() }]
            : [],
      };
      // Written before the screen opens, so the first thing the lawyer sees is
      // their own matter rather than an empty one that fills in a moment later.
      await saveResearchState({ data: { researchId: id, state } });
      await saveResearchRecords({ data: { researchId: id, records } });
      await navigate({
        to: "/research/$researchId",
        params: { researchId: id },
        search: { tab: "brief" },
      });
    } catch (e) {
      setProblem((e as Error).message || "The research matter could not be started.");
      setBusy(null);
    }
  };

  const ready = instructions.trim().length > 0 || facts.trim().length > 0;

  return (
    <AppShell
      section="research"
      scroll={false}
      back={{ label: "Research", href: "/research" }}
      breadcrumb={
        <Crumbs items={[{ label: "Research", to: "/research" }, { label: "New research" }]} />
      }
      assistant={{
        key: "research-new",
        screen: "New research",
        intro: "Tell me what you are researching and I will frame the questions.",
      }}
    >
      <div className="rs-screen">
        <div className="rs-body" style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: "6px 0 4px" }}>
              What are you researching?
            </h1>
            <p className="rs-note" style={{ fontSize: 12.5 }}>
              Write the instruction and the facts as you would to a junior. Scripta works out the
              jurisdiction, the questions and where to look, and shows you all three before any
              research begins.
            </p>
          </div>

          {problem && (
            <p className="rs-problem" role="alert">
              {problem}
            </p>
          )}

          <Card>
            <Field label="Instructions">
              <textarea
                className="rs-textarea is-tall"
                autoFocus
                placeholder="Prepare a research memorandum advising whether the liability cap in clause 14 is enforceable under UAE law, and what amendments we should propose."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>
            <Field
              label="Facts"
              hint="Scripta breaks this into a factual record you can classify and edit."
            >
              <textarea
                className="rs-textarea is-tall"
                placeholder="Nexa Engineering LLC entered into a three-year engineering services agreement with Atlas Developments LLC, value AED 12 million. Clause 14 caps aggregate liability at the prior 12 months' fees and excludes indirect and consequential loss. There is no carve-out for gross negligence."
                value={facts}
                onChange={(e) => setFacts(e.target.value)}
              />
            </Field>
          </Card>

          <details>
            <summary
              style={{ cursor: "pointer", fontSize: 12.5, color: "#0b57d0", padding: "2px 0" }}
            >
              Set the scope yourself
            </summary>
            <div style={{ paddingTop: 12 }}>
              <Card>
                <div className="rs-settings">
                  <Field
                    label="Name"
                    hint="Left blank, the first line of the instructions is used."
                  >
                    <input
                      className="rs-input"
                      value={title}
                      placeholder="UAE limitation of liability"
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </Field>
                  <Select
                    label="Jurisdiction"
                    value={jurisdiction}
                    options={JURISDICTIONS}
                    allowEmpty="Let Scripta infer it"
                    onChange={setJurisdiction}
                  />
                  <Field label="Area of law">
                    <input
                      className="rs-input"
                      value={areaOfLaw}
                      placeholder="Contract law"
                      onChange={(e) => setAreaOfLaw(e.target.value)}
                    />
                  </Field>
                  <Field label="Law as at">
                    <input
                      className="rs-input"
                      value={lawAsAt}
                      placeholder="12 September 2026"
                      onChange={(e) => setLawAsAt(e.target.value)}
                    />
                  </Field>
                  <Select
                    label="Output"
                    value={outputKind}
                    options={OUTPUT_KINDS}
                    onChange={setOutputKind}
                  />
                  <Select label="Depth" value={depth} options={DEPTHS} onChange={setDepth} />
                </div>
              </Card>
            </div>
          </details>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="primary"
              disabled={!ready || busy !== null}
              onClick={() => void start(true)}
            >
              Start research
            </Button>
            <Button disabled={busy !== null} onClick={() => void start(false)}>
              Open an empty matter
            </Button>
            {busy && <Working label={busy} />}
            <div className="rs-spacer" />
            <span className="rs-note">
              Documents are filed on the Sources tab once the matter is open.
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
