/**
 * Brand kit: the palette, the type, the tone, and the words the client does
 * not use. The avoid list is not advice — every post is checked against it
 * before it can go out.
 */
import { useState } from "react";
import { Button } from "@/components/primitives";
import {
  Empty,
  ErrorLine,
  Facts,
  Field,
  FieldRow,
  OrgPage,
  Panel,
  TextArea,
  TextInput,
} from "@/organisation/ui";
import { insertMarketing, updateMarketing } from "../db";
import { ASSET_KIND_LABEL, can, isHex, parseWords, type BrandKit as Kit } from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";
import { AssetPreview } from "./PostEditor";

export default function BrandKit({ m, level, go }: SectionProps) {
  const [editing, setEditing] = useState(false);
  const edit = can(level, "kit");
  const kit = m.kit;
  const logos = m.assets.filter(
    (a) => a.status === "approved" && a.kind.startsWith("logo") && a.mimeType?.startsWith("image/"),
  );

  if (editing && edit) return <KitEditor m={m} kit={kit} onDone={() => setEditing(false)} />;

  return (
    <OrgPage
      title="Brand kit"
      subtitle={
        edit
          ? "How the client looks and sounds. Posts are checked against the words it avoids."
          : "How the client looks and sounds. Approvers keep it up to date."
      }
      actions={
        edit && (
          <Button variant="primary" onClick={() => setEditing(true)}>
            {kit ? "Edit brand kit" : "Set up brand kit"}
          </Button>
        )
      }
    >
      {!kit ? (
        <Empty
          title="No brand kit yet"
          body="Record the palette, the typefaces, the tone of voice and any words the client does not use."
          {...(edit
            ? {
                action: (
                  <Button variant="primary" onClick={() => setEditing(true)}>
                    Set up brand kit
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <>
          <Panel title="Palette">
            {kit.palette.length === 0 ? (
              <p className="og-muted">No colours recorded.</p>
            ) : (
              <div className="mk-swatches">
                {kit.palette.map((p, i) => (
                  <div key={`${p.hex}${i}`} className="mk-swatch">
                    <span style={{ background: isHex(p.hex) ? p.hex : "#fff" }} />
                    <strong>{p.name || "Unnamed"}</strong>
                    <code>{p.hex.toUpperCase()}</code>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Type and voice">
            <Facts
              rows={[
                [
                  "Headings",
                  kit.headingFont && (
                    <span style={{ fontFamily: kit.headingFont }}>{kit.headingFont}</span>
                  ),
                ],
                [
                  "Body",
                  kit.bodyFont && <span style={{ fontFamily: kit.bodyFont }}>{kit.bodyFont}</span>,
                ],
                ["Tone", kit.tone],
                [
                  "Words it avoids",
                  kit.avoidWords.length ? (
                    <span className="og-chips">
                      {kit.avoidWords.map((w) => (
                        <span key={w} className="og-chip">
                          {w}
                        </span>
                      ))}
                    </span>
                  ) : (
                    ""
                  ),
                ],
                ["Rules", kit.rules && <span className="mk-pre">{kit.rules}</span>],
              ]}
            />
          </Panel>
          <Panel
            title="Logos"
            right={
              <button type="button" className="org-link" onClick={() => go({ view: "assets" })}>
                All assets
              </button>
            }
          >
            {logos.length === 0 ? (
              <p className="og-muted">No approved logo yet. Upload one under Assets.</p>
            ) : (
              <div className="mk-assets">
                {logos.map((a) => (
                  <figure key={a.id} className="mk-asset">
                    <AssetPreview path={a.storagePath} mime={a.mimeType} />
                    <figcaption>
                      <strong>{a.name}</strong>
                      <span className="og-muted">{ASSET_KIND_LABEL[a.kind]}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </OrgPage>
  );
}

function KitEditor({
  m,
  kit,
  onDone,
}: {
  m: SectionProps["m"];
  kit: Kit | null;
  onDone: () => void;
}) {
  const write = useMarketingWrite(m.clientId);
  const [palette, setPalette] = useState(
    kit?.palette.length ? kit.palette : [{ name: "", hex: "#123247" }],
  );
  const [headingFont, setHeadingFont] = useState(kit?.headingFont ?? "");
  const [bodyFont, setBodyFont] = useState(kit?.bodyFont ?? "");
  const [tone, setTone] = useState(kit?.tone ?? "");
  const [avoid, setAvoid] = useState((kit?.avoidWords ?? []).join(", "));
  const [rules, setRules] = useState(kit?.rules ?? "");

  const save = async () => {
    const bad = palette.find((p) => p.hex.trim() && !isHex(p.hex));
    if (bad)
      return write.setError(`“${bad.hex}” is not a colour. Use six-digit hex, like #123247.`);
    const row = {
      palette: palette
        .filter((p) => p.hex.trim())
        .map((p) => ({ name: p.name.trim(), hex: p.hex.trim().toLowerCase() })),
      heading_font: headingFont.trim(),
      body_font: bodyFont.trim(),
      tone: tone.trim(),
      avoid_words: parseWords(avoid),
      rules: rules.trim(),
    };
    const ok = await write.run(() =>
      kit
        ? updateMarketing("mkt_brand_kits", kit.id, row)
        : insertMarketing(m, "mkt_brand_kits", row),
    );
    if (ok) onDone();
  };

  return (
    <OrgPage
      title="Brand kit"
      subtitle="Changes apply to the checks on every post from the next time they run."
      actions={
        <>
          <Button onClick={onDone}>Cancel</Button>
          <Button variant="primary" disabled={write.busy} onClick={() => void save()}>
            {write.busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      <Panel title="Palette">
        <div className="mk-palette-edit">
          {palette.map((p, i) => (
            <div key={i} className="mk-palette-row">
              <input
                type="color"
                value={isHex(p.hex) ? p.hex : "#ffffff"}
                onChange={(e) =>
                  setPalette((list) =>
                    list.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)),
                  )
                }
                aria-label="Colour"
              />
              <input
                value={p.hex}
                onChange={(e) =>
                  setPalette((list) =>
                    list.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)),
                  )
                }
                aria-label="Hex"
                className="mk-hex"
              />
              <input
                value={p.name}
                placeholder="Name, e.g. Navy"
                onChange={(e) =>
                  setPalette((list) =>
                    list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                aria-label="Colour name"
              />
              <button
                type="button"
                className="org-link"
                onClick={() => setPalette((list) => list.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <Button onClick={() => setPalette((list) => [...list, { name: "", hex: "#247a78" }])}>
              Add colour
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="Type and voice">
        <FieldRow>
          <Field label="Heading typeface">
            <TextInput
              value={headingFont}
              onChange={setHeadingFont}
              placeholder="e.g. IBM Plex Serif"
            />
          </Field>
          <Field label="Body typeface">
            <TextInput value={bodyFont} onChange={setBodyFont} placeholder="e.g. IBM Plex Sans" />
          </Field>
        </FieldRow>
        <Field label="Tone of voice">
          <TextArea value={tone} onChange={setTone} rows={2} />
        </Field>
        <Field
          label="Words it avoids"
          hint="Separate with commas. A post using one is blocked until an approver overrides it."
        >
          <TextArea value={avoid} onChange={setAvoid} rows={2} />
        </Field>
        <Field label="Other rules">
          <TextArea value={rules} onChange={setRules} rows={4} />
        </Field>
      </Panel>
    </OrgPage>
  );
}
