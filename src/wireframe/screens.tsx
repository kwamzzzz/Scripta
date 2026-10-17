/**
 * Screens assembled from the generated wireframe frames. Each screen mounts a
 * frame's topbar, tab row and content inside the shell drawn in the wireframe.
 * Every caller must provide its live or explicitly empty data set.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import AppShell, { type SectionKey } from "@/components/AppShell";
import type { AssistantScope } from "@/lib/assistant";
import type { Trail } from "@/lib/nav";
import type { WF } from "./data";

export type D = typeof WF;
export type FrameParts = {
  default: ComponentType<{ d: D }>;
  Topbar?: ComponentType<{ d: D }>;
  Tabs?: ComponentType<{ d: D }>;
};

export function FrameScreen({
  section,
  frame,
  d,
  assistant,
  hideAssistant,
  back,
  trackLabel,
  tabs,
  topbar,
  lead,
  children,
}: {
  section: SectionKey;
  frame: FrameParts;
  d: D;
  assistant?: Partial<AssistantScope> | undefined;
  hideAssistant?: boolean | undefined;
  back?: Trail | undefined;
  trackLabel?: string | undefined;
  /** Override the frame's own tab row (for live tabs). */
  tabs?: ReactNode | undefined;
  topbar?: ReactNode | undefined;
  /** A header row drawn inside the content column (frames that carry their own title bar). */
  lead?: ReactNode | undefined;
  children?: ReactNode | undefined;
}) {
  const Content = frame.default;
  const Top = frame.Topbar;
  const Tb = frame.Tabs;
  return (
    <AppShell
      section={section}
      scroll={false}
      topbar={topbar ?? (Top ? <Top d={d} /> : undefined)}
      tabs={tabs ?? (Tb ? <Tb d={d} /> : undefined)}
      assistant={assistant}
      hideAssistant={hideAssistant}
      back={back}
      trackLabel={trackLabel}
    >
      {lead && (
        <div
          style={{
            padding: "11px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid #e2e2e2",
            flex: "none",
            background: "#fcfcfc",
          }}
        >
          {lead}
        </div>
      )}
      <Content d={d} />
      {children}
    </AppShell>
  );
}

/** Native workspace tabs retain the existing route and selection callbacks. */
export function TabRow<T extends string>({
  tabs,
  active,
  onChange,
  right,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  right?: ReactNode | undefined;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      {tabs.map((t, index) => (
        <button
          key={t.id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="tab"
          className={`wf-tab${t.id === active ? " is-active" : ""}`}
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            const nextTab = tabs[next];
            if (!nextTab) return;
            buttons.current[next]?.focus();
            onChange(nextTab.id);
          }}
        >
          {t.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      {right}
    </>
  );
}

/** A wireframe modal (1d, 2c, 3b, 4l): the card floats over a dimmed workspace. */
export function Modal({
  open,
  onClose,
  children,
  label = "Workspace dialog",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    node.showModal();
    return () => node.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      aria-label={label}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        maxWidth: "none",
        maxHeight: "none",
        margin: 0,
        border: 0,
        color: "inherit",
        background: "rgba(35,34,31,.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: "clamp(12px, 3vw, 26px)",
      }}
    >
      {/* ------------------------------------------------------------------
          WHY THIS WRAPPER CENTRES ITS CHILD INSTEAD OF BEING CENTRED
          ------------------------------------------------------------------

          `justify-content: center` above centres this wrapper, which only
          works if the wrapper is as wide as the card inside it. It was not.

          A flex item takes its base size from its content's max-content width,
          and a dialog's longest paragraph is a single unwrapped line — one
          sentence of body copy measured about 1148px. So the wrapper sized
          itself to the TEXT, filled the dialog, and left nothing to centre;
          the card, at `width: min(560px, 100%)`, then resolved its 100%
          against that wrapper and sat against its left padding.

          Every dialog in the app was off-centre by half the slack. It reads as
          "slightly wrong" rather than broken, which is why it lasted this long.

          `fit-content` does not fix it — fit-content is min(max-content,
          available), and here max-content IS the available width. So the
          wrapper stays full width on purpose and centres the card itself.
          ------------------------------------------------------------------ */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          minWidth: 0,
          maxHeight: "100%",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </dialog>
  );
}

/** Small hook for screens that need to open a modal frame from a static element. */
export function useToggle(initial = false) {
  const [on, set] = useState(initial);
  return { on, open: () => set(true), close: () => set(false), set };
}

export function useGo() {
  const navigate = useNavigate();
  return (to: string) => void navigate({ to });
}
