/**
 * Assets: logos, templates and photography. Anyone with access uploads; an
 * upload waits for an approver before a post can use it without a note, and a
 * retired or expired asset blocks any post that still carries it.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/primitives";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  Empty,
  ErrorLine,
  Field,
  FieldRow,
  OrgDialog,
  OrgPage,
  Pill,
  Select,
  TextArea,
  TextInput,
} from "@/organisation/ui";
import { formatDay } from "@/organisation/model";
import { assetUrl, removeAsset, updateMarketing, uploadAsset } from "../db";
import { ASSET_KIND_LABEL, assetLapsed, can, type Asset, type AssetKind } from "../model";
import { useMarketingWrite, type SectionProps } from "../ui";
import { AssetPreview } from "./PostEditor";

export default function Assets({ m, level }: SectionProps) {
  const write = useMarketingWrite(m.clientId);
  const { confirmDelete, confirmDialog } = useConfirmDelete();
  const file = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AssetKind>("logo_primary");
  const [editing, setEditing] = useState<Asset | null>(null);
  const approve = can(level, "approve");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    await write.run(async () => {
      for (const f of Array.from(files)) await uploadAsset(m, f, kind);
    });
    if (file.current) file.current.value = "";
  };

  const open = (a: Asset) =>
    void write.run(async () => {
      if (!a.storagePath) return;
      window.open(await assetUrl(a.storagePath, a.name), "_blank", "noopener");
    });

  const remove = async (a: Asset) => {
    if (
      !(await confirmDelete({
        what: `“${a.name}”`,
        consequence: "Posts using it lose their image.",
        binned: false,
        archivable: false,
      }))
    )
      return;
    await write.run(() => removeAsset(a));
  };

  const setStatus = (a: Asset, status: Asset["status"]) =>
    void write.run(() => updateMarketing("mkt_assets", a.id, { status }));

  return (
    <OrgPage
      title="Assets"
      subtitle={
        approve
          ? "Uploads wait for approval. Retire an asset to stop it being used."
          : "What you upload waits for an approver."
      }
      wide
      actions={
        <>
          <div className="rg-filter">
            <Select
              value={kind}
              onChange={(v) => setKind((v || "other") as AssetKind)}
              options={(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => ({
                value: k,
                label: ASSET_KIND_LABEL[k],
              }))}
            />
          </div>
          <input
            ref={file}
            type="file"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <Button variant="primary" disabled={write.busy} onClick={() => file.current?.click()}>
            {write.busy ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <ErrorLine error={write.error} />
      {m.assets.length === 0 ? (
        <Empty
          title="No assets yet"
          body="Upload the client's logos, templates and approved photography. Choose what kind of asset it is first."
        />
      ) : (
        <div className="mk-assets">
          {m.assets.map((a) => {
            const lapsed = assetLapsed(a);
            return (
              <figure key={a.id} className={`mk-asset${lapsed ? " is-lapsed" : ""}`}>
                <button
                  type="button"
                  className="mk-asset-view"
                  onClick={() => open(a)}
                  title="Open"
                >
                  {a.mimeType?.startsWith("image/") ? (
                    <AssetPreview path={a.storagePath} mime={a.mimeType} />
                  ) : (
                    <span className="mk-asset-file">
                      {(a.mimeType?.split("/")[1] ?? "file").toUpperCase()}
                    </span>
                  )}
                </button>
                <figcaption>
                  <strong>{a.name}</strong>
                  <span className="og-muted">
                    {ASSET_KIND_LABEL[a.kind]}
                    {a.expiresOn
                      ? ` · ${lapsed ? "expired" : "until"} ${formatDay(a.expiresOn)}`
                      : ""}
                  </span>
                  <span className="mk-asset-actions">
                    <Pill
                      tone={
                        a.status === "retired" || lapsed
                          ? "retired"
                          : a.status === "approved"
                            ? "good"
                            : "neutral"
                      }
                    >
                      {a.status === "retired"
                        ? "Retired"
                        : lapsed
                          ? "Expired"
                          : a.status === "approved"
                            ? "Approved"
                            : "Awaiting approval"}
                    </Pill>
                    {approve && a.status !== "approved" && (
                      <button
                        type="button"
                        className="org-link"
                        onClick={() => setStatus(a, "approved")}
                      >
                        Approve
                      </button>
                    )}
                    {approve && a.status !== "retired" && (
                      <button
                        type="button"
                        className="org-link"
                        onClick={() => setStatus(a, "retired")}
                      >
                        Retire
                      </button>
                    )}
                    <button type="button" className="org-link" onClick={() => setEditing(a)}>
                      Edit
                    </button>
                    {approve && (
                      <button type="button" className="org-link" onClick={() => void remove(a)}>
                        Delete
                      </button>
                    )}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      {editing && <AssetDialog m={m} asset={editing} onClose={() => setEditing(null)} />}
      {confirmDialog}
    </OrgPage>
  );
}

function AssetDialog({
  m,
  asset,
  onClose,
}: {
  m: SectionProps["m"];
  asset: Asset;
  onClose: () => void;
}) {
  const write = useMarketingWrite(m.clientId);
  const [name, setName] = useState(asset.name);
  const [kind, setKind] = useState<AssetKind>(asset.kind);
  const [expiresOn, setExpiresOn] = useState(asset.expiresOn ?? "");
  const [rules, setRules] = useState(asset.rules);
  return (
    <OrgDialog
      open
      title={`Edit ${asset.name}`}
      onClose={onClose}
      busy={write.busy}
      error={write.error}
      submitLabel="Save"
      onSubmit={async () => {
        if (!name.trim()) return write.setError("An asset needs a name.");
        const ok = await write.run(() =>
          updateMarketing("mkt_assets", asset.id, {
            name: name.trim(),
            kind,
            expires_on: expiresOn || null,
            rules: rules.trim(),
          }),
        );
        if (ok) onClose();
      }}
    >
      <Field label="Name">
        <TextInput value={name} onChange={setName} autoFocus />
      </Field>
      <FieldRow>
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(v) => setKind((v || "other") as AssetKind)}
            options={(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => ({
              value: k,
              label: ASSET_KIND_LABEL[k],
            }))}
          />
        </Field>
        <Field label="Usable until" hint="For licensed photography">
          <TextInput type="date" value={expiresOn} onChange={setExpiresOn} />
        </Field>
      </FieldRow>
      <Field label="How to use it">
        <TextArea value={rules} onChange={setRules} rows={3} />
      </Field>
    </OrgDialog>
  );
}
