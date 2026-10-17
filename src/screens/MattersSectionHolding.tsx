import { Building2, FilePenLine } from "lucide-react";
import AppShell, { Crumbs, type SectionKey } from "@/components/AppShell";
import { C, mono } from "@/lib/tokens";

type HoldingSection = Extract<SectionKey, "contract-drafting" | "corporate-drafting">;

const CONTENT: Record<
  HoldingSection,
  {
    title: string;
    description: string;
    scope: string[];
    icon: typeof FilePenLine;
  }
> = {
  "contract-drafting": {
    title: "Contract Drafting",
    description:
      "This will be the workspace for creating a contract from scratch, writing it by hand or using clearly identified AI assistance.",
    scope: [
      "Start and structure a new contract",
      "Draft and revise the document directly",
      "Use document-level AI once that workflow has been designed and verified",
    ],
    icon: FilePenLine,
  },
  "corporate-drafting": {
    title: "Corporate Drafting",
    description:
      "This will be the workspace for preparing corporate documents with the correct matter context and firm presentation.",
    scope: ["Board resolutions", "Letters", "Firm letterheads"],
    icon: Building2,
  },
};

export default function MattersSectionHolding({ section }: { section: HoldingSection }) {
  const content = CONTENT[section];
  const Icon = content.icon;

  return (
    <AppShell
      section={section}
      back={{ label: content.title, href: `/matters/${section}` }}
      breadcrumb={<Crumbs items={[{ label: content.title }]} />}
      hideAssistant
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
          padding: "64px 28px",
        }}
      >
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: C.panel,
            padding: 32,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: C.accent,
              background: C.accentTint,
              marginBottom: 20,
            }}
          >
            <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div
            style={{
              color: C.muted,
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Planned workspace
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 12px", color: C.text }}>
            {content.title}
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: C.secondary, margin: "0 0 24px" }}>
            {content.description}
          </p>
          <div style={{ borderTop: `1px solid ${C.rowRule}`, paddingTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Planned scope
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: C.secondary,
                fontSize: 13,
                lineHeight: 1.8,
              }}
            >
              {content.scope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p
            role="status"
            style={{
              margin: "24px 0 0",
              paddingTop: 16,
              borderTop: `1px solid ${C.rowRule}`,
              color: C.muted,
              fontSize: 12,
            }}
          >
            This section is not available yet. No drafting controls are shown until the workflow is
            ready to use.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
