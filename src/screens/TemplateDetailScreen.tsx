import { useState } from "react";
import { moveToBin } from "@/lib/trash";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { Crumbs } from "@/components/AppShell";
import { Button } from "@/components/primitives";
import SaveState from "@/components/SaveState";
import { useConfirmDelete } from "@/components/ConfirmDelete";
import {
  addSection,
  deleteSection,
  loadTemplate,
  moveSection,
  templatePlaceholders,
  updateSection,
  updateTemplate,
  type TemplateStatus,
} from "@/lib/templates";
import "./templates-screen.css";

const STATUSES: TemplateStatus[] = ["Draft", "Active", "Retired"];

/**
 * One template: its sections in the order a document is built from them, and
 * the facts it will ask for.
 *
 * Everything here is editable in place and saved on blur, because a template
 * is written by working on it rather than by filling in a form once. The
 * placeholder list is derived from the drafting as it is typed, so it can
 * never disagree with the text it describes.
 */
export default function TemplateDetailScreen({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [heading, setHeading] = useState("");
  const key = ["template", templateId];

  const template = useQuery({
    queryKey: key,
    queryFn: () => loadTemplate(templateId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void refresh(),
  });

  const remove = useMutation({
    mutationFn: () => moveToBin("templates", [templateId]),
    onSuccess: () => void navigate({ to: "/templates" }),
  });

  const { confirmDelete, confirmDialog } = useConfirmDelete();

  /** Asked the way the templates library asks it. */
  const askRemove = async (name: string) => {
    if (
      await confirmDelete({
        what: `“${name}”`,
        consequence: "Every section in it goes too.",
      })
    )
      remove.mutate();
  };

  /** A section takes its drafting and its guidance, and the facts only it asked for. */
  const askRemoveSection = async (sectionId: string, name: string) => {
    if (
      !(await confirmDelete({
        what: `“${name}”`,
        consequence:
          "Its drafting and its guidance go with it, along with any fact only it asked for.",
        archivable: false,
        binned: false,
      }))
    )
      return;
    save.mutate(() => deleteSection(sectionId));
  };

  if (template.isLoading) {
    return (
      <AppShell
        section="templates"
        back={{ label: "Templates", href: "/templates" }}
        breadcrumb={<Crumbs items={[{ label: "Templates", to: "/templates" }, { label: "…" }]} />}
        scroll={false}
      >
        <div className="scripta-page">
          <header className="scripta-page-heading">
            <h1 className="scripta-page-title">Template</h1>
          </header>
          <p className="template-empty" role="status">
            Loading template…
          </p>
        </div>
      </AppShell>
    );
  }

  const t = template.data;
  if (!t) {
    return (
      <AppShell
        section="templates"
        back={{ label: "Templates", href: "/templates" }}
        breadcrumb={
          <Crumbs
            items={[
              { label: "Templates", to: "/templates" },
              { label: template.isError ? "Unavailable" : "Not found" },
            ]}
          />
        }
        scroll={false}
      >
        <div className="scripta-page">
          <header className="scripta-page-heading">
            <h1 className="scripta-page-title">
              {template.isError ? "Template could not be loaded" : "Template not found"}
            </h1>
          </header>
          {template.isError ? (
            <div className="templates-notice is-error" role="alert">
              <p>{(template.error as Error).message}</p>
              <Button onClick={() => void template.refetch()}>Try again</Button>
            </div>
          ) : (
            <>
              <p className="template-empty">It may have been deleted, or the link may be wrong.</p>
              <Button onClick={() => void navigate({ to: "/templates" })}>Back to templates</Button>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  const facts = templatePlaceholders(t.sections);

  return (
    <AppShell
      section="templates"
      back={{ label: "Templates", href: "/templates" }}
      trackLabel={t.name}
      breadcrumb={<Crumbs items={[{ label: "Templates", to: "/templates" }, { label: t.name }]} />}
      scroll={false}
      assistant={{
        key: `template.${t.id}`,
        label: t.name,
        screen: "Template sections",
        intro:
          "Ask whether these sections cover the document you need, what one of them should say, or which facts a drafter will be asked for.",
      }}
    >
      <div className="scripta-page">
        <div className="template-detail-content">
          <header className="scripta-page-heading template-detail-heading">
            <div>
              <h1 className="scripta-page-title">{t.name}</h1>
              <p className="scripta-page-description">Template details and document sections.</p>
            </div>
            <div className="scripta-page-actions">
              <Button
                variant="danger"
                onClick={() => void askRemove(t.name)}
                disabled={remove.isPending}
                title="Delete this template"
              >
                {remove.isPending ? "Deleting…" : "Delete template"}
              </Button>
            </div>
          </header>

          <div className="template-save-note">
            <SaveState
              mode="on-blur"
              status={save.isError ? "error" : save.isPending ? "saving" : "idle"}
              error={save.isError ? (save.error as Error).message : undefined}
            />
          </div>
          {remove.isError && (
            <p className="templates-notice is-error" role="alert">
              The template could not be deleted. {(remove.error as Error).message}
            </p>
          )}
          {template.isError && (
            <p className="templates-notice is-error" role="alert">
              The template could not be refreshed. {(template.error as Error).message}
            </p>
          )}

          <section className="scripta-section" aria-labelledby="template-details-title">
            <h2 className="scripta-section-title" id="template-details-title">
              Details
            </h2>
            <div className="template-metadata">
              <label className="scripta-form-field template-field-wide">
                Template name
                <input
                  defaultValue={t.name}
                  onBlur={(e) =>
                    e.target.value.trim() !== t.name &&
                    save.mutate(() => updateTemplate(templateId, { name: e.target.value }))
                  }
                />
              </label>
              <label className="scripta-form-field template-field-wide">
                Description
                <textarea
                  defaultValue={t.description}
                  placeholder="Describe when to use this template."
                  rows={2}
                  onBlur={(e) =>
                    e.target.value !== t.description &&
                    save.mutate(() =>
                      updateTemplate(templateId, {
                        description: e.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="scripta-form-field">
                Document type
                <input
                  defaultValue={t.docType}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== t.docType &&
                    save.mutate(() => updateTemplate(templateId, { docType: e.target.value }))
                  }
                />
              </label>
              <label className="scripta-form-field">
                Jurisdiction
                <input
                  defaultValue={t.jurisdiction}
                  placeholder="Jurisdiction"
                  onBlur={(e) =>
                    e.target.value !== t.jurisdiction &&
                    save.mutate(() =>
                      updateTemplate(templateId, {
                        jurisdiction: e.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="scripta-form-field">
                Status
                <select
                  value={t.status}
                  onChange={(e) =>
                    save.mutate(() =>
                      updateTemplate(templateId, {
                        status: e.target.value as TemplateStatus,
                      }),
                    )
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {facts.length > 0 && (
            <section className="scripta-section" aria-labelledby="template-facts-title">
              <h2 className="scripta-section-title template-facts-title" id="template-facts-title">
                Facts this template asks for <span className="template-count">{facts.length}</span>
              </h2>
              <ul className="template-facts" role="list">
                {facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="scripta-section" aria-labelledby="template-sections-title">
            <h2
              className="scripta-section-title template-sections-title"
              id="template-sections-title"
            >
              Sections <span className="template-count">{t.sections.length}</span>
            </h2>
            {t.sections.length === 0 ? (
              <p className="template-empty">
                No sections yet. Add a heading below to begin the document structure.
              </p>
            ) : (
              <ol className="template-section-list" role="list">
                {t.sections.map((s, i) => (
                  <li key={s.id} className="template-section">
                    <header className="template-section-header">
                      <h3>Section {i + 1}</h3>
                      <div className="template-section-actions">
                        <label
                          className="template-optional"
                          title="An optional section is offered when drafting and can be declined"
                        >
                          <input
                            type="checkbox"
                            defaultChecked={s.optional}
                            onChange={(e) =>
                              save.mutate(() =>
                                updateSection(s.id, {
                                  optional: e.target.checked,
                                }),
                              )
                            }
                          />
                          Optional
                        </label>
                        <Button
                          variant="quiet"
                          onClick={() => save.mutate(() => moveSection(t.sections, s.id, "up"))}
                          disabled={i === 0}
                          title="Move up"
                        >
                          Move up
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => save.mutate(() => moveSection(t.sections, s.id, "down"))}
                          disabled={i === t.sections.length - 1}
                          title="Move down"
                        >
                          Move down
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() =>
                            void askRemoveSection(s.id, s.heading || `Section ${i + 1}`)
                          }
                          title="Remove this section"
                        >
                          Remove
                        </Button>
                      </div>
                    </header>
                    <label className="scripta-form-field">
                      Section heading
                      <input
                        defaultValue={s.heading}
                        onBlur={(e) =>
                          e.target.value !== s.heading &&
                          save.mutate(() => updateSection(s.id, { heading: e.target.value }))
                        }
                      />
                    </label>
                    <label className="scripta-form-field template-drafting">
                      Drafting
                      <textarea
                        defaultValue={s.body}
                        placeholder="The drafting for this section."
                        rows={6}
                        onBlur={(e) =>
                          e.target.value !== s.body &&
                          save.mutate(() => updateSection(s.id, { body: e.target.value }))
                        }
                      />
                      <small>Use {"{{party a}}"} for a fact to be filled in when drafting.</small>
                    </label>
                    <label className="scripta-form-field">
                      Guidance
                      <textarea
                        defaultValue={s.guidance}
                        placeholder="Instructions for completing this section."
                        rows={2}
                        onBlur={(e) =>
                          e.target.value !== s.guidance &&
                          save.mutate(() => updateSection(s.id, { guidance: e.target.value }))
                        }
                      />
                      <small>Guidance is not included in the finished document.</small>
                    </label>
                  </li>
                ))}
              </ol>
            )}
            <form
              className="template-add-section"
              onSubmit={(e) => {
                e.preventDefault();
                if (!heading.trim()) return;
                save.mutate(() => addSection(templateId, heading));
                setHeading("");
              }}
            >
              <label className="scripta-form-field">
                New section heading
                <input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="Recitals, Definitions, Governing law…"
                />
              </label>
              <Button type="submit" variant="primary" disabled={!heading.trim()}>
                Add section
              </Button>
            </form>
          </section>
        </div>
        {confirmDialog}
      </div>
    </AppShell>
  );
}
