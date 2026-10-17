/* Generated from Legal Drafting Wireframes (4).html — frame 2a. Edit by hand after generation. */
import { Fragment } from "react";
import GeminiUsage from "@/components/GeminiUsage";
import FeedbackChip from "@/components/FeedbackChip";
import { Link } from "@tanstack/react-router";
import type { WF } from "../data";
type D = typeof WF;

export function Topbar({ d }: { d: D }) {
  return (
    <>
      <Link
        to="/transcripts"
        className="wf-crumb"
        style={{ color: "#6f6f6f", textDecoration: "none" }}
      >
        Transcript distiller
      </Link>
      <span style={{ color: "#6b6b6b" }}>/</span>
      <span>New distillation</span>
      <div style={{ flex: "1" }}></div>
      <FeedbackChip screen="New distillation" />
      <GeminiUsage />
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="2a"
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
            padding: "24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "22px", fontWeight: "600" }}>
              Distil a call into drafting instructions
            </div>
            <div style={{ color: "#5f5f5f", fontSize: "12px" }}>
              Bring in a transcript. Scripta returns terms, definitions and open questions mapped to
              clauses.
            </div>
          </div>
          <div
            style={{
              border: "1px dashed #d2d2d2",
              borderRadius: "12px",
              background: "#fbfbfb",
              boxShadow: "inset 0 1px 0 #fff,0 1px 3px rgba(0,0,0,.04)",
              padding: "34px 30px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
            style-hover="border-color:#9aa0a6;background:#f7f8f9;box-shadow:inset 0 1px 0 #fff,0 0 0 3px rgba(120,130,140,.10)"
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#f2f2f2",
                border: "1px solid #e4e4e4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "2px",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <path d="M17 8l-5-5-5 5"></path>
                <path d="M12 3v13"></path>
              </svg>
            </div>
            <div style={{ fontSize: "15px", fontWeight: "600" }}>Drop a transcript file here</div>
            <div
              role="group"
              aria-label="Transcript import methods"
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "4px",
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {d.slots.chooseFile ?? (
                <button
                  type="button"
                  style={{
                    border: "1px solid #0b57d0",
                    background: "#0b57d0",
                    color: "#fff",
                    borderRadius: "6px",
                    padding: "7px 15px",
                    font: "500 13px 'Geist',sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Choose file
                </button>
              )}
              {d.slots.paste ?? (
                <button
                  type="button"
                  style={{
                    border: "1px solid #d4d4d4",
                    background: "#fff",
                    color: "#545454",
                    borderRadius: "6px",
                    padding: "7px 15px",
                    font: "500 13px 'Geist',sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Paste transcript
                </button>
              )}
            </div>
            <div
              style={{
                font: "500 10px 'Geist',sans-serif",
                color: "#6f6f6f",
                letterSpacing: ".06em",
                textAlign: "center",
              }}
            >
              DOCX · PDF · TXT · MD · SRT · VTT · OR PASTE TEXT DIRECTLY
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div
              style={{
                border: "1px solid #dedede",
                borderRadius: "8px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div
                style={{
                  font: "500 10px 'Geist',sans-serif",
                  color: "#6f6f6f",
                  letterSpacing: ".06em",
                }}
              >
                ATTACH TO MANDATE
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid #d4d4d4",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                {d.slots.mandate ?? <span>Convertible Loan Agreement</span>}
                <div style={{ flex: "1" }}></div>
                <span style={{ color: "#6b6b6b" }}>▾</span>
              </div>
            </div>
            <div
              style={{
                border: "1px solid #dedede",
                borderRadius: "8px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div
                style={{
                  font: "500 10px 'Geist',sans-serif",
                  color: "#6f6f6f",
                  letterSpacing: ".06em",
                }}
              >
                SPOKEN LANGUAGE
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid #d4d4d4",
                  borderRadius: "6px",
                  padding: "8px 10px",
                }}
              >
                <span>English</span>
                <div style={{ flex: "1" }}></div>
                <span style={{ color: "#6b6b6b" }}>▾</span>
              </div>
            </div>
          </div>
          <div
            style={{
              flex: "1",
              minHeight: "0",
              border: "1px solid #dedede",
              borderRadius: "8px",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                font: "500 10px 'Geist',sans-serif",
                color: "#6f6f6f",
                letterSpacing: ".06em",
              }}
            >
              WHAT TO EXTRACT
            </div>
            {d.distillOptions.map((o, o_i) => (
              <Fragment key={o_i}>
                <div
                  style={{
                    display: "flex",
                    gap: "11px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "17px",
                      height: "17px",
                      flex: "none",
                      border: "1px solid #333333",
                      borderRadius: "4px",
                      background: "#f1f1f1",
                      marginTop: "1px",
                    }}
                  ></div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "baseline",
                      minWidth: "0",
                    }}
                  >
                    <span>{o.name}</span>
                    <span style={{ color: "#6f6f6f", fontSize: "12px" }}>{o.note}</span>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                border: "1px solid #0b57d0",
                background: "#0b57d0",
                color: "#fff",
                borderRadius: "6px",
                padding: "9px 18px",
                fontSize: "12px",
              }}
            >
              Distil transcript
            </div>
            <div style={{ color: "#6f6f6f", fontSize: "12px" }}>
              About $0.40 of Gemini API usage per 30 minutes of audio
            </div>
          </div>
          {d.slots.recent}
        </div>
      </div>
    </div>
  );
}
