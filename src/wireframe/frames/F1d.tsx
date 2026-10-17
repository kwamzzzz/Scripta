/* Generated from Legal Drafting Wireframes (4).html — frame 1d. Edit by hand after generation. */
import { Fragment } from "react";
import type { WF } from "../data";
type D = typeof WF;

export default function Content({ d }: { d: D }) {
  return (
    <div
      data-frame="1d"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "22px",
        fontSize: "13px",
        color: "#232323",
      }}
    >
      <div
        style={{
          width: "340px",
          border: "1px solid #dedede",
          borderRadius: "10px",
          background: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,.07)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "16px", fontWeight: "600" }}>Instructions</span>
          <div style={{ flex: "1" }}></div>
          <span style={{ color: "#545454", fontSize: "15px", fontWeight: "600" }}>×</span>
        </div>
        <div
          style={{
            padding: "0 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "11px",
          }}
        >
          <div
            style={{
              background: "#f2f2f2",
              borderRadius: "7px",
              padding: "10px 11px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span
              style={{
                color: "#333333",
                minWidth: "0",
                lineHeight: "1.45",
                fontSize: "12.5px",
              }}
            >
              Increase the interest rate by 3%
            </span>
            <div style={{ flex: "1" }}></div>
            <span
              style={{
                width: "11px",
                height: "12px",
                flex: "none",
                border: "1px solid #6b6b6b",
                borderTopWidth: "3px",
                borderRadius: "0 0 3px 3px",
              }}
            ></span>
          </div>
          <div
            style={{
              border: "1px solid #c6c6c6",
              borderRadius: "8px",
              padding: "11px 12px",
              minHeight: "56px",
              color: "#6b6b6b",
              lineHeight: "1.5",
              fontSize: "12.5px",
            }}
          >
            Describe the change you want made…
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                font: "500 10px 'Geist',sans-serif",
                color: "#6b6b6b",
                letterSpacing: ".04em",
              }}
            >
              ⌘+ENTER TO ADD
            </span>
            <div style={{ flex: "1" }}></div>
            <div
              style={{
                background: "#a1a1a1",
                color: "#fff",
                borderRadius: "7px",
                padding: "7px 15px",
                fontSize: "12.5px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <span
                style={{
                  width: "0",
                  height: "0",
                  borderStyle: "solid",
                  borderWidth: "5px 0 5px 8px",
                  borderColor: "transparent transparent transparent #fff",
                }}
              ></span>
              Add
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          alignSelf: "flex-end",
          width: "520px",
          border: "1px solid #dedede",
          borderRadius: "10px",
          background: "#fff",
          boxShadow: "0 6px 18px rgba(0,0,0,.07)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "13px 16px", borderBottom: "1px solid #e8e8e8" }}>
          <div>Select instructions to include</div>
          <div style={{ color: "#6f6f6f", fontSize: "12px" }}>
            Choose which instructions go into this redraft session
          </div>
        </div>
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "11px",
          }}
        >
          {d.instructions.map((ins, ins_i) => (
            <Fragment key={ins_i}>
              <div
                style={{
                  border: "1px solid #e4e4e4",
                  borderRadius: "8px",
                  padding: "12px",
                  display: "flex",
                  gap: "11px",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: "17px",
                    height: "17px",
                    border: "1px solid #333333",
                    borderRadius: "4px",
                    background: "#f1f1f1",
                    flex: "none",
                    marginTop: "2px",
                  }}
                ></div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    minWidth: "0",
                  }}
                >
                  <div>{ins.title}</div>
                  <div
                    style={{
                      color: "#5f5f5f",
                      fontSize: "12px",
                      lineHeight: "1.5",
                    }}
                  >
                    {ins.summary}
                  </div>
                  <div
                    style={{
                      font: "500 10px 'Geist',sans-serif",
                      color: "#6b6b6b",
                      letterSpacing: ".06em",
                    }}
                  >
                    {ins.anchor}
                  </div>
                </div>
              </div>
            </Fragment>
          ))}
        </div>
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #e8e8e8",
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              border: "1px solid #d4d4d4",
              borderRadius: "6px",
              padding: "7px 16px",
              fontSize: "12px",
              color: "#545454",
            }}
          >
            Cancel
          </div>
          <div
            style={{
              border: "1px solid #0b57d0",
              background: "#0b57d0",
              color: "#fff",
              borderRadius: "6px",
              padding: "7px 16px",
              fontSize: "12px",
            }}
          >
            Start with 2 instructions
          </div>
        </div>
      </div>
    </div>
  );
}
