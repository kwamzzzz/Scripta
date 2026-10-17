/* Generated from Legal Drafting Wireframes (4).html — frame 1e. Edit by hand after generation. */
import { Fragment } from "react";
import GeminiMark from "@/components/GeminiMark";
import type { WF } from "../data";
type D = typeof WF;

export function Topbar({ d }: { d: D }) {
  return (
    <>
      <span style={{ color: "#6f6f6f" }}>Matters</span>
      <span style={{ color: "#6b6b6b" }}>/</span>
      <span>Convertible Loan Agreement</span>
      <div style={{ flex: "1" }}></div>
      <div
        style={{
          border: "1px solid #d4d4d4",
          borderRadius: "14px",
          padding: "5px 12px",
          color: "#5f5f5f",
          fontSize: "12px",
        }}
      >
        Share your feedback
      </div>
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

export function Tabs({ d }: { d: D }) {
  return (
    <>
      <span style={{ color: "#0b57d0", boxShadow: "0 2px 0 #0b57d0" }}>Contract Editor</span>
      <span style={{ color: "#5f5f5f" }}>Contract Summary</span>
      <span style={{ color: "#5f5f5f" }}>Notes</span>
      <div style={{ flex: "1" }}></div>
      <div
        style={{
          font: "500 10px 'Geist',sans-serif",
          color: "#6f6f6f",
          letterSpacing: ".06em",
        }}
      >
        REDRAFT SESSION · 2 INSTRUCTIONS
      </div>
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="1e"
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
            flex: "1",
            minWidth: "0",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
            padding: "18px 22px",
            gap: "12px",
          }}
        >
          <div
            style={{
              flex: "1",
              minHeight: "0",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "1px solid #dedede",
                borderRadius: "8px",
                background: "#f5f5f5",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  font: "500 10px 'Geist',sans-serif",
                  color: "#6f6f6f",
                  letterSpacing: ".06em",
                }}
              >
                YOU
              </div>
              <div>I have the following instructions for you:</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                  paddingLeft: "4px",
                  lineHeight: "1.55",
                }}
              >
                {d.sessionInstructions.map((s, s_i) => (
                  <Fragment key={s_i}>
                    <div style={{ display: "flex", gap: "9px" }}>
                      <span style={{ color: "#6b6b6b" }}>·</span>
                      <span>{s}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ color: "#545454", lineHeight: "1.55" }}>
                Please add these to the contract and ask me any follow-up questions you need before
                implementing them.
              </div>
            </div>
            <div
              style={{
                border: "1px solid #e4e4e4",
                borderRadius: "8px",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "9px",
              }}
            >
              <div
                style={{
                  font: "500 10px 'Geist',sans-serif",
                  color: "#333333",
                  letterSpacing: ".06em",
                }}
              >
                ASSISTANT
              </div>
              <div style={{ lineHeight: "1.6", color: "#333333" }}>
                I can help with these changes. This isn't legal advice, but I'll walk you through
                the commercial decisions to get to solid contract language.
              </div>
              <div style={{ lineHeight: "1.6" }}>First, on the interest rate:</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                  paddingLeft: "4px",
                  lineHeight: "1.55",
                  color: "#333333",
                }}
              >
                {d.followUpsA.map((f, f_i) => (
                  <Fragment key={f_i}>
                    <div style={{ display: "flex", gap: "9px" }}>
                      <span style={{ color: "#6b6b6b" }}>·</span>
                      <span>{f}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ lineHeight: "1.6" }}>
                Second, on ordinary repayment in a change of control:
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                  paddingLeft: "4px",
                  lineHeight: "1.55",
                  color: "#333333",
                }}
              >
                {d.followUpsB.map((f, f_i) => (
                  <Fragment key={f_i}>
                    <div style={{ display: "flex", gap: "9px" }}>
                      <span style={{ color: "#6b6b6b" }}>·</span>
                      <span>{f}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <div
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "8px",
              padding: "11px 12px",
              color: "#6b6b6b",
            }}
          >
            Answer the questions, or ask for changes…
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <div
              style={{
                flex: "1",
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                padding: "9px 0",
                textAlign: "center",
                fontSize: "12px",
                color: "#545454",
              }}
            >
              Back to editor
            </div>
            <div
              style={{
                flex: "1",
                border: "1px solid #0b57d0",
                background: "#0b57d0",
                color: "#fff",
                borderRadius: "6px",
                padding: "9px 0",
                textAlign: "center",
                fontSize: "12px",
              }}
            >
              Review & finalise
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
