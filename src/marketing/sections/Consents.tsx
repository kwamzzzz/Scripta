/**
 * Consents: the people and organisations the client may — or may not — name.
 * A post that names one is checked against its status here.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  Empty,
  ErrorLine,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Panel,
  Pill,
  Select,
  TextInput,
} from "@/organisation/ui";
import { relTime } from "@/lib/home-data";
import { deleteMarketing, insertMarketing, updateMarketing } from "../db";
import { can, type Consent } from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";

const STATUS: Record<Consent["status"], { label: string; tone: "good" | "neutral" | "danger" }> = {
  granted: { label: "Granted", tone: "good" },
  requested: { label: "Asked for", tone: "neutral" },
  refused: { label: "Refused", tone: "danger" },
};

export default function Consents({ m, level }: SectionProps) {
  const write = useMarketingWrite(m.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const [editing, setEditing] = useState<Consent | "new" | null>(null);
  const edit = can(level, "consents");

  return (
    <OrgPage
      title="Consents"
      subtitle="Who may be named. A post naming anyone here goes out only with consent granted, or an approver's override."
      actions={
        edit && (
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add consent
          </Button>
        )
      }
    >
      <ErrorLine error={write.error} />
      {m.consents.length === 0 ? (
        <Empty
          title="No consents recorded"
          body="Record each client, partner or person a post might name, and whether they have agreed to it."
        />
      ) : (
        <Panel>
          <ul className="og-rows">
            {m.consents.map((c) => (
              <li key={c.id}>
                <div className="og-row-main">
                  <span className="og-row-title">{c.party}</span>
                  <span className="og-row-meta">
                    {[c.note, `Updated ${relTime(c.updatedAt)}`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="og-row-side">
                  <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
                  {edit && (
                    <>
                      <button type="button" className="org-link" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="org-link"
                        onClick={() =>
                          void confirmDelete({
                            what: `consent for ${c.party}`,
                            binned: false,
                            archivable: false,
                          }).then(
                            (yes) => yes && write.run(() => deleteMarketing("mkt_consents", c.id)),
                          )
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {editing && (
        <ConsentDialog
          m={m}
          consent={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDialog}
    </OrgPage>
  );
}

function ConsentDialog({
  m,
  consent,
  onClose,
}: {
  m: SectionProps["m"];
  consent: Consent | null;
  onClose: () => void;
}) {
  const write = useMarketingWrite(m.clientId);
  const [party, setParty] = useState(consent?.party ?? "");
  const [status, setStatus] = useState<Consent["status"]>(consent?.status ?? "requested");
  const [note, setNote] = useState(consent?.note ?? "");
  return (
    <OrgDialog
      open
      title={consent ? `Consent for ${consent.party}` : "Add consent"}
      blurb="Use the name as it would appear in a post: that is what the check looks for."
      onClose={onClose}
      busy={write.busy}
      error={write.error}
      submitLabel="Save"
      onSubmit={async () => {
        if (!party.trim()) return write.setError("Who is the consent from?");
        const row = { party: party.trim(), status, note: note.trim() };
        const ok = await write.run(() =>
          consent
            ? updateMarketing("mkt_consents", consent.id, row)
            : insertMarketing(m, "mkt_consents", row),
        );
        if (ok) onClose();
      }}
    >
      <FieldRow>
        <Field label="Name">
          <TextInput value={party} onChange={setParty} autoFocus placeholder="e.g. Kessler AG" />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(v) => setStatus((v || "requested") as Consent["status"])}
            options={(Object.keys(STATUS) as Consent["status"][]).map((s) => ({
              value: s,
              label: STATUS[s].label,
            }))}
          />
        </Field>
      </FieldRow>
      <Field label="Note" hint="Where it is recorded, and any limits">
        <TextInput value={note} onChange={setNote} />
      </Field>
    </OrgDialog>
  );
}
