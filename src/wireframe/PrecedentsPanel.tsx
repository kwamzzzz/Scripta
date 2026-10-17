/** Wireframe 5c: the precedents panel and the suggestion card inside the editor. */
import { Fragment } from "react";
import type { WF } from "./data";

type PrecClause = (typeof WF.precClauses)[number];

export function PrecedentSuggestion({
  label,
  text,
  source,
  onUse,
}: {
  label: string;
  text: string;
  source: string;
  onUse: (mode: "replace" | "insert") => void;
}) {
  return (
    <>
      <div
        className="wf-frame-link"
        style={{
          border: "1px dashed #0b57d0",
          borderRadius: "8px",
          background: "#fffaf9",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div
          style={{
            font: "500 9px 'Geist',sans-serif",
            color: "#0b57d0",
            letterSpacing: ".06em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            lineHeight: "1.65",
            fontFamily: "'Century Schoolbook',Georgia,serif",
            fontSize: "12.5px",
            color: "#333333",
          }}
        >
          {text}
        </div>
        <div
          style={{
            font: "500 9px 'Geist',sans-serif",
            color: "#6b6b6b",
            letterSpacing: ".06em",
          }}
        >
          {source}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => onUse("replace")}
            style={{
              border: "1px solid #0b57d0",
              background: "#0b57d0",
              color: "#fff",
              borderRadius: "6px",
              padding: "6px 13px",
              fontSize: "12px",
            }}
          >
            Replace clause
          </button>
          <button
            type="button"
            onClick={() => onUse("insert")}
            style={{
              border: "1px solid #d4d4d4",
              color: "#545454",
              borderRadius: "6px",
              padding: "6px 13px",
              fontSize: "12px",
            }}
          >
            Insert below
          </button>
          <button
            type="button"
            style={{
              border: "1px solid #d4d4d4",
              color: "#545454",
              borderRadius: "6px",
              padding: "6px 13px",
              fontSize: "12px",
            }}
          >
            Compare
          </button>
        </div>
      </div>
    </>
  );
}

export function PrecedentsPanel({
  matchLabel,
  clauses,
  onClose,
  onInsert,
}: {
  matchLabel: string;
  clauses: PrecClause[];
  onClose: () => void;
  onInsert: (c: PrecClause) => void;
}) {
  return (
    <>
      <div
        style={{
          width: "340px",
          borderLeft: "1px solid #e2e2e2",
          background: "#f8f8f8",
          display: "flex",
          flexDirection: "column",
          minHeight: "0",
        }}
      >
        <div
          style={{
            padding: "11px 14px",
            borderBottom: "1px solid #e2e2e2",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div style={{ minWidth: "0" }}>
            <div style={{ fontSize: "15px" }}>Precedents</div>
            <div style={{ color: "#6f6f6f", fontSize: "11.5px" }}>{matchLabel}</div>
          </div>
          <div style={{ flex: "1" }}></div>
          <span className="wf-frame-link" style={{ color: "#6b6b6b" }} onClick={onClose}>
            ×
          </span>
        </div>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #e8e8e8",
            display: "flex",
            gap: "7px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "11px",
              padding: "3px 9px",
              fontSize: "11px",
              color: "#545454",
              background: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            Same clause
          </div>
          <div
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "11px",
              padding: "3px 9px",
              fontSize: "11px",
              color: "#545454",
              background: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            Lender side
          </div>
          <div
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "11px",
              padding: "3px 9px",
              fontSize: "11px",
              color: "#545454",
              background: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            Firm approved only
          </div>
        </div>
        <div
          style={{
            flex: "1",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            overflow: "hidden",
          }}
        >
          {clauses.map((c, c_i) => (
            <Fragment key={c_i}>
              <div
                style={{
                  border: "1px solid #e4e4e4",
                  borderRadius: "8px",
                  background: "#fff",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ fontSize: "12.5px", minWidth: "0" }}>{c.name}</span>
                  <div style={{ flex: "1" }}></div>
                  <span
                    className="wf-frame-link"
                    onClick={() => onInsert(c)}
                    style={{ color: "#0b57d0", fontSize: "11.5px", whiteSpace: "nowrap" }}
                  >
                    Insert
                  </span>
                </div>
                <div style={{ color: "#545454", fontSize: "11.5px", lineHeight: "1.45" }}>
                  {c.note}
                </div>
                <div
                  style={{
                    font: "500 9px 'Geist',sans-serif",
                    color: "#6b6b6b",
                    letterSpacing: ".06em",
                  }}
                >
                  {c.from}
                  {" · "}
                  {c.flag}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        <div
          style={{
            padding: "11px 14px",
            borderTop: "1px solid #e2e2e2",
            color: "#5f5f5f",
            fontSize: "11px",
            lineHeight: "1.5",
          }}
        >
          Client names are redacted on insert; the link back to the source deal stays in the audit
          trail.
        </div>
      </div>
    </>
  );
}
