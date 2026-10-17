/* Generated from Legal Drafting Wireframes (4).html — frame 3a. Edit by hand after generation. */
import { Fragment } from "react";
import GeminiMark from "@/components/GeminiMark";
import FeedbackChip from "@/components/FeedbackChip";
import type { WF } from "../data";
type D = typeof WF;

export function Topbar({ d }: { d: D }) {
  return (
    <>
      <span style={{ color: "#6f6f6f" }}>Playbook</span>
      <span style={{ color: "#6b6b6b" }}>/</span>
      <span>All playbooks</span>
      <div style={{ flex: "1" }}></div>
      <FeedbackChip screen="Playbooks" />
      <div
        title="AI assistant ready"
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: "9px",
          height: "34px",
          padding: "0 5px 0 4px",
          borderRadius: "999px",
          background: "#fff",
          border: "1px solid #e2e2e2",
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        }}
      >
        <span
          style={{
            width: "26px",
            height: "26px",
            flex: "none",
            borderRadius: "50%",
            background: "#4285f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GeminiMark size={18} />
        </span>
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: "1.15",
            paddingRight: "2px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "#232323",
              whiteSpace: "nowrap",
            }}
          >
            Gemini API
          </span>
          <span
            style={{
              font: "500 8.5px 'Geist',sans-serif",
              color: "#6f6f6f",
              letterSpacing: ".08em",
              whiteSpace: "nowrap",
            }}
          >
            READY
          </span>
        </span>
        <span
          style={{
            position: "relative",
            width: "132px",
            height: "22px",
            flex: "none",
            borderRadius: "999px",
            background: "#eeeeee",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "0",
              top: "0",
              bottom: "0",
              width: "0%",
              borderRadius: "999px",
              background: "rgba(66,133,244,.22)",
            }}
          ></span>
          <span
            style={{
              position: "absolute",
              right: "9px",
              font: "500 10px 'Geist',sans-serif",
              color: "#232323",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            No usage yet
          </span>
        </span>
        <span
          style={{
            width: "20px",
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b6b6b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7"></path>
            <path d="M21 3v6h-6"></path>
          </svg>
        </span>
      </div>
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="3a"
      style={{
        fontSize: "13px",
        color: "#232323",
        background: "#fcfcfc",
        flex: "1",
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
        minHeight: "0",
      }}
    >
      <div style={{ flex: "1", display: "flex", minHeight: "0" }}>
        <div
          style={{
            width: "236px",
            borderRight: "1px solid #e2e2e2",
            background: "#fafafa",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
          }}
        >
          <div
            style={{
              padding: "11px 14px",
              borderBottom: "1px solid #e8e8e8",
              font: "500 10px 'Geist',sans-serif",
              color: "#6f6f6f",
              letterSpacing: ".06em",
            }}
          >
            PLAYBOOKS
          </div>
          <div
            style={{
              flex: "1",
              padding: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              overflow: "hidden",
            }}
          >
            {d.playbooks.map((p, p_i) => (
              <Fragment key={p_i}>
                <div
                  className="wf-frame-link"
                  onClick={() => d.on.selectPlaybook?.(p)}
                  style={{
                    border: p.selected ? "1px solid #e0b3ab" : "1px solid #e4e4e4",
                    background: p.selected ? "#e8f0fe" : undefined,
                    borderRadius: "6px",
                    padding: "9px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <div style={{ fontSize: "12.5px" }}>{p.name}</div>
                  <div style={{ color: "#6f6f6f", fontSize: "11.5px" }}>{p.scope}</div>
                  <div
                    style={{
                      font: "500 9.5px 'Geist',sans-serif",
                      color: "#6b6b6b",
                      letterSpacing: ".06em",
                    }}
                  >
                    {p.rules}
                    {" · "}
                    {p.updated}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div style={{ padding: "10px", borderTop: "1px solid #e8e8e8" }}>
            <div
              className="wf-frame-link"
              onClick={() => d.on.newPlaybook?.()}
              style={{
                border: "1px solid #a8c7fa",
                color: "#0b57d0",
                background: "#f5f9ff",
                borderRadius: "6px",
                padding: "7px 0",
                textAlign: "center",
                fontSize: "12px",
              }}
            >
              New playbook
            </div>
          </div>
        </div>
        <div
          style={{
            flex: "1",
            minWidth: "0",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #e2e2e2",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div style={{ minWidth: "0" }}>
              <div style={{ fontSize: "17px", fontWeight: "600", whiteSpace: "nowrap" }}>
                {d.playbookHead.name}
              </div>
              <div
                style={{
                  color: "#6f6f6f",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                {d.playbookHead.meta}
              </div>
            </div>
            <div style={{ flex: "1" }}></div>
            <div
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                padding: "6px 11px",
                fontSize: "12px",
                flex: "none",
                whiteSpace: "nowrap",
                color: "#545454",
              }}
            >
              Import
            </div>
            <div
              className="wf-frame-link"
              onClick={() => d.on.addRule?.()}
              style={{
                border: "1px solid #0b57d0",
                background: "#0b57d0",
                color: "#fff",
                borderRadius: "6px",
                padding: "6px 13px",
                fontSize: "12px",
                flex: "none",
                whiteSpace: "nowrap",
              }}
            >
              Add rule
            </div>
          </div>
          <div
            style={{
              padding: "10px 18px",
              borderBottom: "1px solid #e8e8e8",
              background: "#f8f8f8",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "11.5px",
                flex: "none",
                whiteSpace: "nowrap",
                color: "#545454",
              }}
            >
              {"All clauses "}
              <span style={{ color: "#6b6b6b" }}>▾</span>
            </div>
            <div
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "11.5px",
                flex: "none",
                whiteSpace: "nowrap",
                color: "#545454",
              }}
            >
              {"All positions "}
              <span style={{ color: "#6b6b6b" }}>▾</span>
            </div>
            <div style={{ flex: "1" }}></div>
            <span
              style={{
                font: "500 9.5px 'Geist',sans-serif",
                color: "#6b6b6b",
                letterSpacing: ".06em",
              }}
            >
              {d.playbookHead.shown}
            </span>
          </div>
          <div
            style={{
              flex: "1",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              overflow: "hidden",
            }}
          >
            {d.playbookRules.map((r, r_i) => (
              <Fragment key={r_i}>
                <div
                  style={{
                    border: "1px solid #e4e4e4",
                    borderRadius: "8px",
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                    }}
                  >
                    <span
                      style={{
                        font: "500 9.5px 'Geist',sans-serif",
                        color: "#6b6b6b",
                        letterSpacing: ".06em",
                      }}
                    >
                      {r.no}
                    </span>
                    <span style={{ color: "#0b57d0", fontSize: "11.5px" }}>{r.clause}</span>
                    <div style={{ flex: "1" }}></div>
                    <span
                      style={{
                        border: "1px solid #d4d4d4",
                        borderRadius: "11px",
                        padding: "2px 9px",
                        fontSize: "11px",
                        color: "#545454",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.pos}
                    </span>
                    <span
                      style={{
                        font: "500 9.5px 'Geist',sans-serif",
                        color: "#6b6b6b",
                        letterSpacing: ".06em",
                      }}
                    >
                      {r.state}
                    </span>
                  </div>
                  <div style={{ lineHeight: "1.55", color: "#333333" }}>{r.text}</div>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      paddingTop: "4px",
                      borderTop: "1px solid #ebebeb",
                      color: "#5f5f5f",
                      fontSize: "11.5px",
                    }}
                  >
                    <span className="wf-frame-link" onClick={() => d.on.editRule?.(r)}>
                      Edit
                    </span>
                    <span>Model language</span>
                    <span>Where it applies</span>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
