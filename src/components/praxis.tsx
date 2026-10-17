import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { ClauseStatus, Risk, Seg } from "@/data/legal";
import { C, mono, riskColors, statusColors } from "@/lib/tokens";

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: C.muted,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Panel({
  children,
  style,
  className,
  ...rest
}: { children: ReactNode; style?: CSSProperties } & Omit<HTMLAttributes<HTMLDivElement>, "style">) {
  return (
    <div
      {...rest}
      className={["px-panel", className].filter(Boolean).join(" ")}
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="px-panel-header"
      style={{
        padding: "13px 17px",
        borderBottom: `1px solid ${C.cardRule}`,
        fontWeight: 600,
        fontSize: 13,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ status, style }: { status: ClauseStatus; style?: CSSProperties }) {
  const [bg, col] = statusColors[status];
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 10px",
        borderRadius: 6,
        background: bg,
        color: col,
        ...style,
      }}
    >
      {status}
    </span>
  );
}

export function RiskDot({ risk }: { risk: Risk }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: riskColors[risk],
        flex: "none",
        display: "inline-block",
      }}
    />
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontFamily: mono, ...style }}>{children}</span>;
}

type DiffMode = "orig" | "amend" | "read";

export function DiffText({ segs, mode }: { segs: Seg[]; mode: DiffMode }) {
  const keep = mode === "orig" ? "d" : mode === "amend" ? "i" : null;
  const shown = keep ? segs.filter((s) => s.k === "n" || s.k === keep) : segs;
  return (
    <>
      {shown.map((s, i) => {
        const col =
          s.k === "d" ? C.red : s.k === "i" ? C.green : mode === "read" ? "#211f1c" : C.body;
        let bg = "transparent";
        if (mode === "read") bg = s.k === "i" ? "#eaf3ee" : s.k === "d" ? "#fbeeec" : "transparent";
        else if (mode === "orig" && s.k === "d") bg = "#f9ebe9";
        else if (mode === "amend" && s.k === "i") bg = "#e6f2ec";
        return (
          <span
            key={i}
            style={{
              textDecoration: s.k === "d" ? "line-through" : "none",
              color: col,
              background: bg,
            }}
          >
            {s.t}
          </span>
        );
      })}
    </>
  );
}
