import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/store/app";
import { C } from "@/lib/tokens";
import { workspaceLabel } from "@/lib/workspaces";
import CreateFirmDialog from "@/components/CreateFirmDialog";

function chipStyle(on: boolean) {
  return {
    padding: "7px 14px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: on ? 600 : 400,
    background: on ? C.accentTint : "transparent",
    color: on ? C.accent : C.secondary,
    border: `1px solid ${on ? C.accentTint : C.border}`,
    whiteSpace: "nowrap" as const,
  };
}

export default function WorkspaceSwitcher() {
  const { workspaces, workspace, set } = useApp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The signed-in person's name already sits under the logo, so the personal
  // workspace is labelled by what it is rather than repeating the name. Firms
  // are named, because a person may belong to more than one.
  const label = workspaceLabel;
  const [creating, setCreating] = useState(false);

  // Firms first, then the one personal workspace, so somebody who belongs to a
  // firm is not reading past their own private space to reach their work.
  const ordered = [
    ...workspaces.filter((w) => w.kind === "firm"),
    ...workspaces.filter((w) => w.kind !== "firm"),
  ];

  if (!workspace) return null;

  return (
    <div
      ref={rootRef}
      className="scripta-workspace-switcher"
      style={{ position: "relative" }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Switch workspace: ${label(workspace)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="px-tab scripta-workspace-trigger"
        style={{ ...chipStyle(open), width: "100%", fontFamily: "inherit" }}
      >
        <span>{label(workspace)}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className="scripta-workspace-menu"
          role="menu"
          aria-label="Workspaces"
          onKeyDown={(event) => {
            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
            );
            if (!options.length) return;
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            let next: number;
            if (event.key === "ArrowDown") next = (index + 1) % options.length;
            else if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else return;
            event.preventDefault();
            options[next]?.focus();
          }}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 30,
            minWidth: 200,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(28,27,25,0.08)",
          }}
        >
          {ordered.map((w, index) => (
            <button
              type="button"
              key={w.id}
              role="menuitemradio"
              aria-checked={w.id === workspace.id}
              tabIndex={-1}
              className={`px-row scripta-workspace-option${w.id === workspace.id ? " is-selected" : ""}`}
              onClick={() => {
                set({ workspaceId: w.id, matterId: null, statusOverride: {} });
                setOpen(false);
                triggerRef.current?.focus();
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: 0,
                borderBottom: `1px solid ${C.rowRule}`,
                background: "transparent",
                fontFamily: "inherit",
                textAlign: "left",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                color: w.id === workspace.id ? C.accent : C.body,
                fontWeight: w.id === workspace.id ? 600 : 400,
              }}
            >
              <span>{label(w)}</span>
              <span
                style={{
                  fontSize: 11,
                  color: C.faint,
                }}
              >
                {w.kind === "firm" ? "Firm" : "Yours alone"}
              </span>
            </button>
          ))}

          {/* The journey that did not exist: a firm is a name and an owner. */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="px-row scripta-workspace-option"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: 0,
              background: "transparent",
              fontFamily: "inherit",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 13,
              color: C.accent,
            }}
          >
            Create a firm workspace…
          </button>
        </div>
      )}

      {creating && <CreateFirmDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
