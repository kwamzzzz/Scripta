import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Briefcase,
  FileSearch,
  FileText,
  FolderOpen,
  ListChecks,
  LayoutDashboard,
  Mic,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { C, elevation, mono, radius, sans, scriptaTheme, tabular } from "@/lib/tokens";
import { useBoard } from "@/lib/use-board";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/store/app";
import { useClients } from "@/components/client-choice";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: typeof FolderOpen;
  run: () => void;
};

/** Subsequence match — "lim liab" finds "Limitation of Liability" without an index. */
function score(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const needle = q.toLowerCase();
  if (t.includes(needle)) return 1000 - t.indexOf(needle);
  let i = 0;
  let hits = 0;
  for (const ch of needle) {
    const at = t.indexOf(ch, i);
    if (at === -1) return -1;
    if (at === i) hits += 2;
    hits += 1;
    i = at + 1;
  }
  return hits;
}

/**
 * ⌘K. Every destination and action reachable by typing, so navigation never
 * requires hunting through the sidebar. Grouped, keyboard-driven, no mouse needed.
 */
export default function CommandPalette({ showTrigger = false }: { showTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { board } = useBoard();
  const { workspaceId } = useApp();
  const clients = useClients();
  // Read when the palette opens: flows are the one kind of work that may be
  // filed to no matter, so the matters list cannot stand in for them.
  const flows = useQuery({
    queryKey: ["palette-flows", workspaceId],
    enabled: open && !!workspaceId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matter_flows")
        .select("id, name, deleted_at, matters(name)")
        .eq("workspace_id", workspaceId!);
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((f) => ({
        id: f.id as string,
        name: (f.name as string | null) ?? "",
        matterName: (f.matters?.name as string | undefined) ?? "",
        deletedAt: (f.deleted_at as string | null) ?? null,
      }));
    },
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const resultsId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) returnFocusRef.current = document.activeElement as HTMLElement;
        setOpen(!open);
        setQ("");
        setCursor(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      setOpen(false);
      void navigate({ to });
    };
    const nav: Item[] = [
      {
        id: "n-home",
        label: "Home",
        group: "Go to",
        icon: LayoutDashboard,
        run: go("/"),
      },
      {
        id: "n-clients",
        label: "Clients",
        group: "Go to",
        icon: Briefcase,
        run: go("/clients"),
      },
      {
        id: "n-matters",
        label: "Matters",
        group: "Go to",
        icon: FolderOpen,
        run: go("/matters"),
      },
      {
        id: "n-flow",
        label: "Flow",
        group: "Go to",
        icon: ListChecks,
        run: go("/matters/flow"),
      },
      {
        id: "n-review",
        label: "Contract Review",
        group: "Go to",
        icon: FileSearch,
        run: go("/matters/review"),
      },
      {
        id: "n-docs",
        label: "Document Review",
        group: "Go to",
        icon: FileText,
        run: go("/documents"),
      },
      {
        id: "n-tr",
        label: "Transcript Distillation",
        group: "Go to",
        icon: Mic,
        run: go("/transcripts"),
      },
      {
        id: "n-pb",
        label: "Playbooks",
        group: "Go to",
        icon: BookOpen,
        run: go("/playbooks"),
      },
      {
        id: "n-set",
        label: "Settings",
        group: "Go to",
        icon: SettingsIcon,
        run: go("/settings"),
      },
    ];
    const clientItems: Item[] = (clients.data ?? [])
      .filter((c) => !c.archivedAt)
      .map((c) => ({
        id: `c-${c.id}`,
        label: c.name,
        hint: "Client",
        group: "Clients",
        icon: Briefcase,
        run: () => {
          setOpen(false);
          void navigate({ to: "/clients/$clientId", params: { clientId: c.id } });
        },
      }));
    // Every flow this person can open, including ones filed to no matter,
    // which no other list in the palette would reach.
    const flowItems: Item[] = (flows.data ?? [])
      .filter((f) => !f.deletedAt)
      .map((f) => ({
        id: `f-${f.id}`,
        label: f.name || f.matterName || "Untitled flow",
        hint: f.matterName ? `Flow · ${f.matterName}` : "Flow · not filed to a matter",
        group: "Flows",
        icon: ListChecks,
        run: () => {
          setOpen(false);
          void navigate({ to: "/flows/$flowId", params: { flowId: f.id } });
        },
      }));
    const matters: Item[] = board.matters.map((m) => ({
      id: `m-${m.id}`,
      label: m.name,
      hint: [m.client, m.counterparty].filter(Boolean).join(" · "),
      group: "Matters",
      icon: FolderOpen,
      run: () => {
        setOpen(false);
        void navigate({ to: "/matters/$matterId", params: { matterId: m.id } });
      },
    }));
    const docs: Item[] = board.docs.map((d) => ({
      id: `d-${d.id}`,
      label: d.name,
      hint: [d.kind, d.ver].filter(Boolean).join(" · "),
      group: "Documents",
      icon: FileText,
      run: () => {
        setOpen(false);
        void navigate({
          to: "/matters/$matterId",
          params: { matterId: d.matterId },
          search: { screen: "review" },
        });
      },
    }));
    const playbooks: Item[] = board.playbooks.map((p) => ({
      id: `p-${p.id}`,
      label: p.name,
      hint: `${p.version} · ${p.positions} positions`,
      group: "Playbooks",
      icon: BookOpen,
      run: go("/playbooks"),
    }));
    return [...nav, ...clientItems, ...matters, ...flowItems, ...docs, ...playbooks];
  }, [board, navigate, clients.data, flows.data]);

  const results = useMemo(() => {
    if (!q.trim()) return items.slice(0, 12);
    return items
      .map((it) => ({
        it,
        s: Math.max(score(q, it.label), score(q, it.hint ?? "") - 5),
      }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((r) => r.it);
  }, [q, items]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    if (open) {
      listRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [cursor, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(c + 1, results.length - 1)));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      results[cursor]?.run();
    }
  };

  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button
            type="button"
            className="scripta-search-trigger"
            aria-label="Search workspace"
            onClick={(event) => {
              returnFocusRef.current = event.currentTarget;
              setQ("");
              setCursor(0);
            }}
          >
            <Search size={15} aria-hidden="true" />
            <span>Search</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
        </DialogTrigger>
      )}
      <DialogPortal>
        <DialogOverlay
          className="scripta-search-overlay"
          style={{ zIndex: 200, background: "rgba(25,24,21,0.28)" }}
        />
        <DialogPrimitive.Content
          className="px-pop scripta-search-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
          }}
          style={{
            ...scriptaTheme,
            position: "fixed",
            top: "12vh",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 201,
            width: 560,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "62vh",
            fontFamily: sans,
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: radius.lg,
            boxShadow: elevation.overlay,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <DialogTitle className="sr-only">Search workspace</DialogTitle>
          <div
            className="scripta-search-input-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "14px 17px",
              borderBottom: `1px solid ${C.cardRule}`,
            }}
          >
            <Search size={15} strokeWidth={1.75} color={C.faint} />
            <input
              ref={inputRef}
              className="scripta-search-input"
              role="combobox"
              aria-label="Search matters, documents and playbooks"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={resultsId}
              aria-activedescendant={
                results[cursor] ? `${resultsId}-${results[cursor]!.id}` : undefined
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search matters, documents, playbooks…"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                fontSize: 14,
                fontFamily: sans,
                color: C.text,
                background: "transparent",
              }}
            />
            <button
              type="button"
              className="scripta-search-close"
              aria-label="Close search"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                fontFamily: mono,
                fontSize: 11,
                color: C.faint,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "1px 7px",
              }}
            >
              esc
            </button>
          </div>

          <div
            ref={listRef}
            id={resultsId}
            role="listbox"
            aria-label="Search results"
            className="scripta-search-results"
            style={{ overflowY: "auto", padding: "4px 0" }}
          >
            {results.length === 0 && (
              <div
                role="status"
                className="scripta-search-empty"
                style={{ padding: "25px 20px", fontSize: 13, color: C.muted }}
              >
                Nothing matches “{q}”.
              </div>
            )}
            {results.map((it, i) => {
              const showGroup = it.group !== lastGroup;
              lastGroup = it.group;
              const on = i === cursor;
              const Icon = it.icon;
              return (
                <div key={it.id} role="presentation">
                  {showGroup && (
                    <div
                      role="presentation"
                      className="scripta-search-group"
                      style={{
                        fontSize: 11,
                        color: C.faint,
                        padding: "11px 20px 6px",
                      }}
                    >
                      {it.group}
                    </div>
                  )}
                  <div
                    id={`${resultsId}-${it.id}`}
                    role="option"
                    aria-selected={on}
                    className={`scripta-search-result${on ? " is-selected" : ""}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => it.run()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 20px",
                      cursor: "pointer",
                      background: on ? C.rowSel : "transparent",
                    }}
                  >
                    {Icon && (
                      <Icon
                        size={14}
                        strokeWidth={1.75}
                        color={on ? C.accent : C.faint}
                        style={{ flex: "none" }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 14,
                        color: C.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {it.label}
                    </span>
                    {it.hint && (
                      <span
                        style={{
                          fontSize: 12,
                          color: C.faint,
                          marginLeft: "auto",
                          whiteSpace: "nowrap",
                          ...tabular,
                        }}
                      >
                        {it.hint}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="scripta-search-footer"
            style={{
              display: "flex",
              gap: 16,
              padding: "10px 20px",
              borderTop: `1px solid ${C.cardRule}`,
              fontSize: 11,
              color: C.faint,
            }}
          >
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span style={{ marginLeft: "auto", fontFamily: mono }}>⌘K</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
