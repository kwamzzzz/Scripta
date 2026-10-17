import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { C, radius } from "@/lib/tokens";
import { Button, SectionLabel } from "@/components/primitives";
import { useTranscriptImport } from "@/lib/transcript-import";

/**
 * Paste a transcript directly. Not every meeting arrives as a file — notes typed
 * during a call go through exactly the same pipeline: parse, map speakers, commit.
 */
export default function PasteTranscript({
  label = "Paste transcript",
  variant = "secondary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const { startPaste, busy } = useTranscriptImport();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (!open)
    return (
      <Button
        variant={variant}
        disabled={busy}
        onClick={() => {
          if (!busy) {
            setProblem(null);
            setOpen(true);
          }
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ClipboardPaste size={14} aria-hidden="true" />
          {label}
        </span>
      </Button>
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(25,24,21,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: radius.lg,
          padding: 20,
          textAlign: "left",
        }}
      >
        <SectionLabel style={{ marginBottom: 6 }}>Paste transcript</SectionLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title"
          style={{
            width: "100%",
            fontSize: 13,
            padding: "7px 10px",
            border: `1px solid ${C.border}`,
            borderRadius: radius.sm,
            fontFamily: "inherit",
            marginBottom: 8,
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "09:14  Sarah Chen (Client): We can't accept uncapped liability.\n09:15  Mark Reeves (Vendor): ..."
          }
          style={{
            width: "100%",
            height: 260,
            fontSize: 13,
            lineHeight: 1.6,
            padding: 11,
            border: `1px solid ${C.border}`,
            borderRadius: radius.sm,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <div style={{ fontSize: 12, color: C.muted, margin: "6px 0 10px" }}>
          Timestamps and speaker labels are detected where present; you’ll confirm speakers, roles
          and the meeting type before anything is saved.
        </div>
        {problem && (
          <div role="alert" style={{ fontSize: 12, color: C.red, margin: "0 0 10px" }}>
            {problem}
          </div>
        )}
        <div style={{ display: "flex", gap: 11, justifyContent: "flex-end" }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || !text.trim()}
            onClick={() => {
              setProblem(null);
              void startPaste(text, title)
                .then(() => {
                  setOpen(false);
                  setText("");
                  setTitle("");
                })
                .catch((e: unknown) => {
                  setProblem(e instanceof Error ? e.message : "Could not import the transcript");
                });
            }}
          >
            {busy ? "Reading…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
