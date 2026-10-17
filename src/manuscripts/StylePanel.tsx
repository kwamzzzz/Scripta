/**
 * The manuscript's style sheet: its own conventions, one rule per line.
 *
 * Conventions Scripta noticed arrive as proposals and do nothing until a
 * person adopts them, because an editor records the author's choices rather
 * than making them. Once adopted, a rule is applied everywhere: the preferred
 * form is never flagged again, and a listed variant is a correction.
 */
import { useState } from "react";
import { Card, Chip } from "@/review/ui";
import { Button } from "@/components/primitives";
import { STYLE_CATEGORY_LABEL, type StyleCategory, type StyleRule } from "./model";

type Draft = Omit<StyleRule, "id"> & { id?: string };

const EMPTY: Draft = {
  category: "spelling",
  preferred: "",
  variants: [],
  note: "",
  origin: "author",
  active: true,
};

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [variants, setVariants] = useState(initial.variants.join(", "));
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="ms-rule-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.preferred.trim() && !d.note.trim()) return;
        setBusy(true);
        try {
          await onSave({
            ...d,
            variants: variants
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <select
        value={d.category}
        onChange={(e) => setD({ ...d, category: e.target.value as StyleCategory })}
      >
        {(Object.keys(STYLE_CATEGORY_LABEL) as StyleCategory[]).map((k) => (
          <option key={k} value={k}>
            {STYLE_CATEGORY_LABEL[k]}
          </option>
        ))}
      </select>
      <input
        placeholder="Use this form (e.g. organisation)"
        value={d.preferred}
        onChange={(e) => setD({ ...d, preferred: e.target.value })}
      />
      <input
        placeholder="Instead of (comma-separated, e.g. organization)"
        value={variants}
        onChange={(e) => setVariants(e.target.value)}
      />
      <input
        placeholder="Note (optional, e.g. define on first use)"
        value={d.note}
        onChange={(e) => setD({ ...d, note: e.target.value })}
      />
      <div className="ms-rule-form-actions">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save rule"}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function StylePanel({
  rules,
  onSave,
  onDelete,
}: {
  rules: StyleRule[];
  onSave: (d: Draft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const proposed = rules.filter((r) => r.origin === "detected" && !r.active);
  const sheet = rules.filter((r) => r.active || r.origin === "author");
  const byCat = new Map<StyleCategory, StyleRule[]>();
  for (const r of sheet) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);

  const line = (r: StyleRule) => (
    <span className="ms-rule-text">
      {r.preferred && <strong>{r.preferred}</strong>}
      {r.variants.length > 0 && <span className="ms-muted"> not {r.variants.join(", ")}</span>}
      {r.note && <span className="ms-muted"> · {r.note}</span>}
    </span>
  );

  return (
    <div className="ms-style">
      {proposed.length > 0 && (
        <Card
          title={`Proposed from the manuscript (${proposed.length})`}
          hint="Conventions the manuscript mostly follows. None is applied until you adopt it; Reverse adopts the other form instead."
        >
          <ul className="ms-rules">
            {proposed.map((r) => (
              <li key={r.id}>
                <Chip tone="quiet">{STYLE_CATEGORY_LABEL[r.category]}</Chip>
                {line(r)}
                <span style={{ flex: 1 }} />
                <Button onClick={() => void onSave({ ...r, active: true })}>Adopt</Button>
                {r.variants.length === 1 && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void onSave({
                        ...r,
                        preferred: r.variants[0]!,
                        variants: [r.preferred],
                        active: true,
                      })
                    }
                  >
                    Reverse
                  </Button>
                )}
                <Button variant="quiet" onClick={() => void onDelete(r.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title="Style sheet"
        hint="The author's and publisher's decisions. Applied on every review: a preferred form is never flagged, a listed variant is corrected."
        right={!editing && <Button onClick={() => setEditing(EMPTY)}>Add rule</Button>}
      >
        {editing && (
          <RuleForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (d) => {
              await onSave(d);
              setEditing(null);
            }}
          />
        )}
        {sheet.length === 0 && !editing ? (
          <p className="ms-quiet">
            No rules yet. Adopt a proposal above, or add the author's own: spellings, terms,
            abbreviations, capitalisation, how dates and numbers are written.
          </p>
        ) : (
          [...byCat.entries()].map(([cat, list]) => (
            <div key={cat} className="ms-rule-group">
              <h3>{STYLE_CATEGORY_LABEL[cat]}</h3>
              <ul className="ms-rules">
                {list.map((r) => (
                  <li key={r.id} className={r.active ? "" : "is-off"}>
                    {line(r)}
                    <span style={{ flex: 1 }} />
                    {!r.active && <Chip tone="quiet">Off</Chip>}
                    <Button variant="quiet" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => void onSave({ ...r, active: !r.active })}
                    >
                      {r.active ? "Turn off" : "Turn on"}
                    </Button>
                    <Button variant="quiet" onClick={() => void onDelete(r.id)}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
