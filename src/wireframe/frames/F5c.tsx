/* Generated from Legal Drafting Wireframes (4).html — frame 5c. Edit by hand after generation. */
import { Fragment } from "react";
import type { WF } from "../data";
type D = typeof WF;

export function Tabs({ d }: { d: D }) {
  return (
    <>
      <span style={{ color: "#0b57d0", boxShadow: "0 2px 0 #0b57d0" }}>Contract Editor</span>
      <span style={{ color: "#5f5f5f" }}>Contract Summary</span>
      <span style={{ color: "#5f5f5f" }}>Playbook Check</span>
      <span style={{ color: "#5f5f5f" }}>Notes</span>
      <div style={{ flex: "1" }}></div>
      <div
        style={{
          border: "1px solid #a8d5b5",
          color: "#137333",
          borderRadius: "6px",
          padding: "6px 14px",
          fontSize: "12px",
          flex: "none",
          whiteSpace: "nowrap",
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
      data-frame="5c"
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
      <div
        style={{
          minHeight: "46px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 14px",
          borderBottom: "1px solid #e2e2e2",
          background: "#f8f8f8",
        }}
      >
        <div
          style={{
            width: "27px",
            height: "27px",
            flex: "none",
            border: "1px solid #d4d4d4",
            borderRadius: "5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "14px 'Geist',sans-serif",
            color: "#545454",
          }}
        >
          ↺
        </div>
        <div
          style={{
            width: "27px",
            height: "27px",
            flex: "none",
            border: "1px solid #d4d4d4",
            borderRadius: "5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "700 12px Century Schoolbook, Georgia, serif",
            color: "#333333",
          }}
        >
          B
        </div>
        <div
          style={{
            width: "27px",
            height: "27px",
            flex: "none",
            border: "1px solid #d4d4d4",
            borderRadius: "5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "500 10px 'Geist',sans-serif",
            color: "#545454",
          }}
        >
          1.
        </div>
        <div style={{ width: "1px", height: "20px", background: "#dedede", margin: "0 4px" }}></div>
        <div
          style={{
            border: "1px solid #333333",
            background: "#f1f1f1",
            color: "#333333",
            borderRadius: "5px",
            height: "27px",
            flex: "none",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 9px",
            fontSize: "11.5px",
            lineHeight: "1",
          }}
        >
          Insert from precedents
        </div>
        <div
          style={{
            border: "1px solid #d4d4d4",
            borderRadius: "5px",
            height: "27px",
            flex: "none",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 9px",
            fontSize: "11.5px",
            lineHeight: "1",
            color: "#545454",
          }}
        >
          {"Insert model language "}
          <span style={{ color: "#6b6b6b" }}>▾</span>
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
          {"More actions "}
          <span style={{ color: "#6b6b6b" }}>▾</span>
        </div>
      </div>
      <div style={{ flex: "1", display: "flex", minHeight: "0" }}>
        <div
          style={{
            flex: "1",
            minWidth: "0",
            padding: "18px 22px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#6b6b6b", font: "500 11px 'Geist',sans-serif" }}>
              3.5
            </span>
            <span style={{ fontSize: "15px", fontWeight: "600" }}>Interest</span>
            <div style={{ flex: "1" }}></div>
            <span
              style={{
                border: "1px solid #f3c0bb",
                background: "#fdecea",
                color: "#c5221f",
                borderRadius: "12px",
                padding: "3px 10px",
                fontSize: "11px",
                whiteSpace: "nowrap",
              }}
            >
              Deviates from R-07
            </span>
          </div>
          <div
            style={{
              border: "1px solid #e4e4e4",
              borderRadius: "8px",
              padding: "14px 16px",
              lineHeight: "1.7",
              color: "#333333",
              fontFamily:
                "'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif",
              background: "#fff",
            }}
          >
            Interest shall accrue on the outstanding principal amount of each Drawdown at a rate of
            8% per annum, calculated on the basis of the actual number of days elapsed and a 365-day
            year.
          </div>
          <div
            style={{
              border: "1px dashed #333333",
              borderRadius: "8px",
              background: "#fbfbfb",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div
              style={{
                font: "500 9px 'Geist',sans-serif",
                color: "#333333",
                letterSpacing: ".06em",
              }}
            >
              PRECEDENT SUGGESTION · CLAUSE 3.5
            </div>
            <div
              style={{
                lineHeight: "1.65",
                fontFamily:
                  "'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif",
                fontSize: "12.5px",
                color: "#333333",
              }}
            >
              Interest shall accrue … at a rate of 11% per annum, calculated on the basis of the
              actual number of days elapsed and a 365-day year (<i>pro rata temporis</i>).
            </div>
            <div
              style={{
                font: "500 9px 'Geist',sans-serif",
                color: "#6b6b6b",
                letterSpacing: ".06em",
              }}
            >
              FROM HELVETIA / LAINE, CL. 3.5 · FIRM APPROVED · USED 7×
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <div
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
              </div>
              <div
                style={{
                  border: "1px solid #d4d4d4",
                  color: "#545454",
                  borderRadius: "6px",
                  padding: "6px 13px",
                  fontSize: "12px",
                }}
              >
                Insert below
              </div>
              <div
                style={{
                  border: "1px solid #d4d4d4",
                  color: "#545454",
                  borderRadius: "6px",
                  padding: "6px 13px",
                  fontSize: "12px",
                }}
              >
                Compare
              </div>
            </div>
          </div>
        </div>
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
              <div style={{ fontSize: "15px", fontWeight: "600" }}>Precedents</div>
              <div style={{ color: "#6f6f6f", fontSize: "11.5px" }}>
                Matched to clause 3.5 · Interest
              </div>
            </div>
            <div style={{ flex: "1" }}></div>
            <span style={{ color: "#6b6b6b" }}>×</span>
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
            {d.precClauses.map((c, c_i) => (
              <Fragment key={c_i}>
                <div
                  style={{
                    border: "1px solid #e4e4e4",
                    borderRadius: "8px",
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <span style={{ fontSize: "12.5px", minWidth: "0" }}>{c.name}</span>
                    <div style={{ flex: "1" }}></div>
                    <span style={{ color: "#0b57d0", fontSize: "11.5px", whiteSpace: "nowrap" }}>
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
      </div>
    </div>
  );
}
