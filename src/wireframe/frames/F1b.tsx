/* Generated from Legal Drafting Wireframes (4).html — frame 1b. Edit by hand after generation. */
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
          border: "1px solid #a8d5b5",
          color: "#137333",
          borderRadius: "6px",
          padding: "6px 14px",
          fontSize: "12px",
        }}
      >
        Finalise
      </div>
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="1b"
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
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "30px",
          }}
        >
          <div
            style={{
              width: "420px",
              display: "flex",
              flexDirection: "column",
              gap: "9px",
            }}
          >
            {d.skeleton.map((s, s_i) => (
              <Fragment key={s_i}>
                <div
                  style={{
                    height: "12px",
                    borderRadius: "3px",
                    background: "#e8e8e8",
                  }}
                ></div>
              </Fragment>
            ))}
          </div>
          <div style={{ color: "#5f5f5f" }}>Loading contract…</div>
          <div style={{ color: "#6b6b6b", fontSize: "12px" }}>
            Parsing clauses and building the table of contents
          </div>
        </div>
      </div>
    </div>
  );
}
