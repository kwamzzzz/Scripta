/* Generated from Legal Drafting Wireframes (4).html — frame 5a. Edit by hand after generation. */
import { Fragment } from "react";
import type { WF } from "../data";
type D = typeof WF;

export function Topbar({ d }: { d: D }) {
  return (
    <>
      <span style={{ color: "#6f6f6f" }}>Precedents</span>
      <span style={{ color: "#6b6b6b" }}>/</span>
      <span>All precedents</span>
      <div
        style={{
          flex: "1",
          maxWidth: "300px",
          border: "1px solid #d4d4d4",
          borderRadius: "8px",
          padding: "6px 10px",
          color: "#6b6b6b",
          fontSize: "12px",
          margin: "0 8px",
        }}
      >
        Search precedents, clauses, parties…
      </div>
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
        Import executed document
      </div>
      <div
        className="wf-frame-link"
        onClick={() => d.on.addPrecedent?.()}
        style={{
          border: "1px solid #0b57d0",
          background: "#0b57d0",
          color: "#fff",
          borderRadius: "6px",
          padding: "6px 11px",
          fontSize: "12px",
          flex: "none",
          whiteSpace: "nowrap",
        }}
      >
        Add precedent
      </div>
    </>
  );
}

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="5a"
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
          padding: "10px 18px",
          borderBottom: "1px solid #e8e8e8",
          background: "#f8f8f8",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {d.precFilters.map((f, f_i) => (
          <Fragment key={f_i}>
            <div
              style={{
                border: "1px solid #d4d4d4",
                borderRadius: "11px",
                padding: "3px 10px",
                fontSize: "11.5px",
                color: "#545454",
                background: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </div>
          </Fragment>
        ))}
        <div style={{ flex: "1" }}></div>
        <span
          style={{
            font: "500 9px 'Geist',sans-serif",
            color: "#6b6b6b",
            letterSpacing: ".06em",
          }}
        >
          {d.precedentHead.shown}
        </span>
      </div>
      <div style={{ flex: "1", display: "flex", minHeight: "0" }}>
        <div
          style={{
            flex: "1.4",
            minWidth: "0",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            overflow: "hidden",
          }}
        >
          {d.precedents.map((p, p_i) => (
            <Fragment key={p_i}>
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
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span style={{ fontSize: "13.5px", minWidth: "0" }}>{p.name}</span>
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
                    {p.state}
                  </span>
                </div>
                <div
                  style={{
                    font: "500 9px 'Geist',sans-serif",
                    color: "#6b6b6b",
                    letterSpacing: ".06em",
                  }}
                >
                  {p.type}
                  {" · "}
                  {p.side}
                  {" SIDE · "}
                  {p.juris}
                  {" · "}
                  {p.date}
                  {" · "}
                  {p.uses}
                </div>
                <div
                  style={{
                    color: "#545454",
                    fontSize: "12px",
                    lineHeight: "1.45",
                  }}
                >
                  {p.tags}
                </div>
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
                  <span
                    className="wf-frame-link"
                    style={{ color: "#0b57d0" }}
                    onClick={() => d.on.openPrecedent?.(p)}
                  >
                    Open
                  </span>
                  <span>Insert a clause</span>
                  <span>Compare with draft</span>
                  <span>Promote to playbook</span>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        <div
          style={{
            width: "400px",
            borderLeft: "1px solid #e2e2e2",
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
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                font: "500 9px 'Geist',sans-serif",
                color: "#6f6f6f",
                letterSpacing: ".06em",
              }}
            >
              HARVESTED CLAUSES
            </span>
            <div style={{ flex: "1" }}></div>
            <span style={{ color: "#6b6b6b", fontSize: "11px" }}>{d.precedentHead.bank}</span>
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                    }}
                  >
                    <span style={{ fontSize: "12.5px", minWidth: "0" }}>{c.name}</span>
                    <div style={{ flex: "1" }}></div>
                    <span
                      style={{
                        border: "1px solid #d4d4d4",
                        borderRadius: "11px",
                        padding: "2px 8px",
                        fontSize: "10.5px",
                        color: "#545454",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.flag}
                    </span>
                  </div>
                  <div
                    style={{
                      color: "#545454",
                      fontSize: "11.5px",
                      lineHeight: "1.45",
                    }}
                  >
                    {c.note}
                  </div>
                  <div
                    style={{
                      font: "500 9px 'Geist',sans-serif",
                      color: "#6b6b6b",
                      letterSpacing: ".06em",
                    }}
                  >
                    {"FROM "}
                    {c.from}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
          <div
            style={{
              padding: "11px 14px",
              borderTop: "1px solid #e8e8e8",
              color: "#5f5f5f",
              fontSize: "11px",
              lineHeight: "1.5",
            }}
          >
            Clauses are extracted on import and keep a link back to the executed deal they came
            from.
          </div>
        </div>
      </div>
    </div>
  );
}
