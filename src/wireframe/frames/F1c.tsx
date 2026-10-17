/* Generated from Legal Drafting Wireframes (4).html — frame 1c. Edit by hand after generation. */
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
      data-frame="1c"
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
        {" "}
        <div
          style={{
            width: "248px",
            borderRight: "1px solid #e2e2e2",
            display: "flex",
            flexDirection: "column",
            minHeight: "0",
            background: "#fafafa",
          }}
        >
          <div
            style={{
              padding: "11px 14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderBottom: "1px solid #e8e8e8",
            }}
          >
            <span
              style={{
                font: "500 10px 'Geist',sans-serif",
                color: "#6f6f6f",
                letterSpacing: ".06em",
              }}
            >
              TABLE OF CONTENTS
            </span>
            <div style={{ flex: "1" }}></div>
            <span style={{ color: "#6b6b6b", fontSize: "11px" }}>Collapse all</span>
          </div>
          <div
            style={{
              flex: "1",
              padding: "8px 6px",
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                1
              </span>
              <span>Effectiveness</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                2
              </span>
              <span>Interpretation</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                2.1
              </span>
              <span>Definitions</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                2.2
              </span>
              <span>Construction</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                3
              </span>
              <span>Convertible Loan</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                3.1
              </span>
              <span>Capitalisation</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                3.2
              </span>
              <span>Drawdown</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                3.3
              </span>
              <span>Transfer of the Drawdown</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
                background: "#f1f1f1",
                borderRadius: "5px",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#333333",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                3.4
              </span>
              <span>Purpose of the Loan</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                3.5
              </span>
              <span>Interest</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                4
              </span>
              <span>Ordinary Repayment</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                4.1
              </span>
              <span>Repayment Right</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                4.2
              </span>
              <span>Maturity Date</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                4.3
              </span>
              <span>Prepayment by the Borrower</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                5
              </span>
              <span>Conversion of Loan</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                5.1
              </span>
              <span>Conversion Mechanics</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                5.1.1
              </span>
              <span>Conversion Right</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                5.1.2
              </span>
              <span>Conversion Process</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                5.1.3
              </span>
              <span>Conversion Price</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▸
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                5.2
              </span>
              <span>Qualifying Funding Round</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                6
              </span>
              <span>Default</span>
            </div>
            <div
              style={{
                padding: "5px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#333333",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "10px",
                  flex: "none",
                  color: "#5f5f5f",
                  fontSize: "10px",
                  marginTop: "2px",
                }}
              >
                ▾
              </span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="#f1f1f1"
                stroke="#333333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "22px",
                  marginTop: "3px",
                }}
              >
                6.1
              </span>
              <span>Events of Default</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                6.1.1
              </span>
              <span>Non-payment</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span
                style={{
                  width: "1px",
                  flex: "none",
                  alignSelf: "stretch",
                  background: "#e2e2e2",
                  margin: "1px 6px 1px 3px",
                }}
              ></span>
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                6.1.2
              </span>
              <span>Insolvency</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                7
              </span>
              <span>Miscellaneous</span>
            </div>
            <div
              style={{
                padding: "4px 8px",
                display: "flex",
                gap: "6px",
                alignItems: "flex-start",
                fontSize: "12px",
                lineHeight: "1.45",
                color: "#545454",
              }}
            >
              <span style={{ width: "10px", flex: "none" }}></span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6f6f6f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flex: "none", marginTop: "1px" }}
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
                <path d="M14 2v5h6"></path>
                <path d="M9 13h6"></path>
                <path d="M9 17h6"></path>
              </svg>
              <span
                style={{
                  color: "#6b6b6b",
                  font: "500 10px 'Geist',sans-serif",
                  minWidth: "24px",
                  marginTop: "3px",
                }}
              >
                S1
              </span>
              <span>Schedule 1 — Parties</span>
            </div>
          </div>
        </div>{" "}
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
              minHeight: "46px",
              display: "flex",
              alignItems: "center",
              gap: "2px",
              padding: "7px 12px",
              borderBottom: "1px solid #e2e2e2",
              background: "#f8f8f8",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 14 4 9l5-5"></path>
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 14 5-5-5-5"></path>
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"></path>
              </svg>
            </div>
            <div
              style={{
                width: "1px",
                height: "18px",
                background: "#dedede",
                margin: "0 5px",
              }}
            ></div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 4h-9"></path>
                <path d="M14 20H5"></path>
                <path d="M15 4 9 20"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 4v6a6 6 0 0 0 12 0V4"></path>
                <path d="M4 20h16"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7V4h16v3"></path>
                <path d="M9 20h6"></path>
                <path d="M12 4v16"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 6h13"></path>
                <path d="M8 12h13"></path>
                <path d="M8 18h13"></path>
                <path d="M3 6h.01"></path>
                <path d="M3 12h.01"></path>
                <path d="M3 18h.01"></path>
              </svg>
            </div>
            <div
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M3 9h18"></path>
                <path d="M3 15h18"></path>
                <path d="M12 3v18"></path>
              </svg>
            </div>
            <div
              style={{
                width: "1px",
                height: "18px",
                background: "#dedede",
                margin: "0 5px",
              }}
            ></div>
            <div
              title="Comments"
              style={{
                width: "28px",
                height: "28px",
                flex: "none",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div style={{ flex: "1" }}></div>
            <div
              title="See changes — review tracked revisions"
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                height: "28px",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "12px",
                color: "#545454",
                flex: "none",
                whiteSpace: "nowrap",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h10"></path>
                <path d="M4 12h6"></path>
                <path d="M4 18h8"></path>
                <path d="m15 15 5 5"></path>
                <path d="m20 15-5 5"></path>
              </svg>
              See changes
            </div>
            <div
              title="Redraft with Scripta — AI-assisted redraft"
              style={{
                border: "1px solid #333333",
                background: "#0b57d0",
                borderRadius: "6px",
                height: "28px",
                padding: "0 11px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "12px",
                color: "#fff",
                fontWeight: "500",
                flex: "none",
                whiteSpace: "nowrap",
              }}
              style-hover="background:#08409b"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"></path>
                <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"></path>
              </svg>
              Redraft with Scripta
            </div>
            <div
              title="More actions"
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "6px",
                width: "30px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
              style-hover="background:#ebebeb"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#545454"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="5" cy="12" r="1.4"></circle>
                <circle cx="12" cy="12" r="1.4"></circle>
                <circle cx="19" cy="12" r="1.4"></circle>
              </svg>
            </div>
          </div>
          <div
            style={{
              flex: "1",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "1px solid #c6c6c6",
                borderRadius: "9px",
                background: "#f6f6f6",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "11px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  borderBottom: "1px solid #dedede",
                }}
              >
                <span style={{ width: "14px", flex: "none", color: "#545454" }}>▾</span>{" "}
                <span
                  style={{
                    font: "500 11px 'Geist',sans-serif",
                    color: "#5f5f5f",
                  }}
                >
                  3
                </span>{" "}
                <span style={{ fontSize: "15.5px", fontWeight: "600" }}>Convertible Loan</span>{" "}
                <span
                  style={{
                    font: "500 9px 'Geist',sans-serif",
                    color: "#6b6b6b",
                    letterSpacing: ".06em",
                  }}
                >
                  5 SUBSECTIONS
                </span>
                <div style={{ flex: "1" }}></div>
                <span
                  style={{
                    border: "1px solid #d4d4d4",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "2px 9px",
                    fontSize: "10.5px",
                    color: "#545454",
                    whiteSpace: "nowrap",
                  }}
                >
                  Section-level
                </span>
                <div
                  style={{
                    border: "1px solid #e0e0e0",
                    background: "#f3f3f3",
                    borderRadius: "7px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    color: "#6f6f6f",
                    flex: "none",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "14px",
                      height: "11px",
                      border: "1.5px solid #6f6f6f",
                      borderRadius: "3px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "9px",
                      lineHeight: "1",
                    }}
                  >
                    +
                  </span>
                </div>
              </div>
              <div
                style={{
                  padding: "11px 13px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    border: "1px solid #dedede",
                    borderRadius: "8px",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      borderBottom: "1px solid #ebebeb",
                    }}
                  >
                    <span
                      style={{
                        width: "12px",
                        flex: "none",
                        color: "#5f5f5f",
                        fontSize: "11px",
                      }}
                    >
                      ▾
                    </span>{" "}
                    <span
                      style={{
                        font: "500 10px 'Geist',sans-serif",
                        color: "#6b6b6b",
                      }}
                    >
                      3.4
                    </span>{" "}
                    <span style={{ fontSize: "14px" }}>Purpose of the Loan</span>
                    <div style={{ flex: "1" }}></div>
                    <div
                      style={{
                        border: "1px solid #f5dda3",
                        background: "#fef7e0",
                        color: "#8a5b00",
                        borderRadius: "11px",
                        padding: "2px 9px",
                        fontSize: "10.5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Good practice
                    </div>
                    <div
                      style={{
                        border: "1px solid #e0e0e0",
                        background: "#f3f3f3",
                        borderRadius: "7px",
                        padding: "4px 8px",
                        fontSize: "11px",
                        color: "#6f6f6f",
                        flex: "none",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "11px",
                          border: "1.5px solid #6f6f6f",
                          borderRadius: "3px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          lineHeight: "1",
                        }}
                      >
                        +
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      lineHeight: "1.7",
                      color: "#333333",
                      fontFamily:
                        "'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif",
                    }}
                  >
                    {
                      "The Borrower shall use the Loan exclusively to finance the development and execution of its go-to-market strategy for its legal technology product, including marketing campaigns, sales team expansion, product launch initiatives and customer acquisition (the "
                    }
                    <b>Use of Funds</b>). The Lender shall bear no liability for the Use of Funds.
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid #dedede",
                    borderRadius: "8px",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      borderBottom: "1px solid #ebebeb",
                    }}
                  >
                    <span
                      style={{
                        width: "12px",
                        flex: "none",
                        color: "#5f5f5f",
                        fontSize: "11px",
                      }}
                    >
                      ▾
                    </span>{" "}
                    <span
                      style={{
                        font: "500 10px 'Geist',sans-serif",
                        color: "#6b6b6b",
                      }}
                    >
                      3.5
                    </span>{" "}
                    <span style={{ fontSize: "14px" }}>Interest</span>
                    <div style={{ flex: "1" }}></div>
                    <div
                      style={{
                        border: "1px solid #f3c0bb",
                        background: "#fdecea",
                        color: "#c5221f",
                        borderRadius: "11px",
                        padding: "2px 9px",
                        fontSize: "10.5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Mandatory law
                    </div>
                    <div
                      style={{
                        border: "1px solid #c6dafc",
                        background: "#e8f0fe",
                        borderRadius: "7px",
                        padding: "4px 8px",
                        fontSize: "11px",
                        color: "#0b57d0",
                        flex: "none",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "11px",
                          border: "1.5px solid #0b57d0",
                          borderRadius: "3px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          lineHeight: "1",
                        }}
                      >
                        +
                      </span>
                      <span>1</span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      lineHeight: "1.7",
                      color: "#333333",
                      fontFamily:
                        "'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div>
                      Interest shall accrue on the outstanding principal amount of each Drawdown at
                      a rate of 8% per annum, calculated on the basis of the actual number of days
                      elapsed and a 365-day year (<i>pro rata temporis</i>).
                    </div>
                    <div>Interest accrued becomes due by the Borrower to the Lender:</div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                        paddingLeft: "4px",
                      }}
                    >
                      {d.interestItems.map((i, i_i) => (
                        <Fragment key={i_i}>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <span
                              style={{
                                color: "#6b6b6b",
                                font: "500 11px 'Geist',sans-serif",
                                minWidth: "18px",
                              }}
                            >
                              {i.no}
                            </span>
                            <span>{i.text}</span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                border: "1px solid #c6c6c6",
                borderRadius: "9px",
                background: "#f6f6f6",
              }}
            >
              <div
                style={{
                  padding: "11px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span style={{ width: "14px", flex: "none", color: "#545454" }}>▸</span>{" "}
                <span
                  style={{
                    font: "500 11px 'Geist',sans-serif",
                    color: "#5f5f5f",
                  }}
                >
                  4
                </span>{" "}
                <span style={{ fontSize: "15.5px", fontWeight: "600" }}>Ordinary Repayment</span>{" "}
                <span
                  style={{
                    font: "500 9px 'Geist',sans-serif",
                    color: "#6b6b6b",
                    letterSpacing: ".06em",
                  }}
                >
                  3 SUBSECTIONS · COLLAPSED
                </span>
                <div style={{ flex: "1" }}></div>
                <span
                  style={{
                    border: "1px solid #d4d4d4",
                    background: "#fff",
                    borderRadius: "11px",
                    padding: "2px 9px",
                    fontSize: "10.5px",
                    color: "#545454",
                    whiteSpace: "nowrap",
                  }}
                >
                  Section-level
                </span>
                <div
                  style={{
                    border: "1px solid #c6dafc",
                    background: "#e8f0fe",
                    borderRadius: "7px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    color: "#0b57d0",
                    flex: "none",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      width: "14px",
                      height: "11px",
                      border: "1.5px solid #0b57d0",
                      borderRadius: "3px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "9px",
                      lineHeight: "1",
                    }}
                  >
                    +
                  </span>
                  <span>2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
