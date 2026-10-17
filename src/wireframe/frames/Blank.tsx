/**
 * The empty state a research frame shows where its rows would be. A new matter
 * has nothing in it, and the frames say so rather than borrowing the drawing's
 * worked example.
 */
/** The same thing inside a bordered table, where a dashed card would sit badly. */
export function BlankRow({ text }: { text: string }) {
  return (
    <div style={{ padding: "16px 14px", color: "#5f5f5f", fontSize: "12px", lineHeight: 1.6 }}>
      {text}
    </div>
  );
}

export function Blank({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        border: "1px dashed #d4d4d4",
        borderRadius: "8px",
        background: "#fff",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: "#232323" }}>{title}</div>
      <div style={{ color: "#5f5f5f", fontSize: "12px", lineHeight: 1.6, maxWidth: "52ch" }}>
        {body}
      </div>
    </div>
  );
}
