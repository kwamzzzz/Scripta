/**
 * "A change could not be saved."
 *
 * The app-wide backstop for a write the database refused. It sits in the shell,
 * so it is on every screen, and it stays until it is dismissed: a message that
 * disappears on its own is no use to someone who was looking at the document
 * rather than at the top of the window.
 *
 * It says which table refused, because that is the difference between "my last
 * sentence did not save" and "none of this matter is being kept", and a person
 * deciding whether to keep working needs to know which.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  clearWriteFailure,
  subscribeWriteHealth,
  watchWrites,
  type WriteFailure,
} from "@/lib/write-health";

import "./write-health.css";

/** The tables a person would not recognise by their database name. */
const FRIENDLY: Record<string, string> = {
  matter_flows: "this flow",
  flow_phases: "a phase",
  flow_deliverables: "a deliverable",
  flow_versions: "a version",
  flow_evidence: "evidence",
  flow_threads: "a reply",
  flow_emails: "an email draft",
  flow_presets: "a preset",
  flow_preset_families: "a preset family",
  clauses: "a clause",
  clause_segments: "clause wording",
  matters: "this matter",
  tasks: "a task",
  documents: "a document",
  corporate_documents: "a document",
  research_matters: "this research",
  playbooks: "a playbook",
  templates: "a template",
  precedents: "a precedent",
  letterheads: "a letterhead",
  comments: "a note",
};

export default function WriteHealth() {
  const [failure, setFailure] = useState<WriteFailure | null>(null);

  useEffect(() => {
    watchWrites();
    return subscribeWriteHealth(setFailure);
  }, []);

  if (!failure) return null;
  const what = FRIENDLY[failure.what] ?? (failure.what ? `“${failure.what}”` : "a change");

  return (
    <div className="scripta-write-health" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <div>
        <strong>A change to {what} was not saved.</strong>
        <span>{failure.detail}</span>
      </div>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
      <button type="button" className="is-quiet" onClick={clearWriteFailure}>
        Dismiss
      </button>
    </div>
  );
}
