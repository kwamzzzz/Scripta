import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApp } from "@/store/app";
import { ACCEPT_ATTR, fileTypeError } from "@/lib/parsing/mime";
import { useTranscriptImport } from "@/lib/transcript-import";
import { C } from "@/lib/tokens";
import { Button } from "@/components/primitives";

/** Strip the extension and Otter's own filename noise for a sensible default title. */
function titleFromFile(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]?otter[_ -]?ai[_ -]?transcript/gi, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Untitled distillation"
  );
}

/**
 * Upload straight into Transcript Distillation.
 *
 * Distilling a transcript should not require setting up a matter first — that was
 * the blocker here, since the import hook needs a container. If none is selected
 * we create one silently, named from the file, which the user can rename or link
 * to a real matter afterwards.
 */
export default function UploadTranscript({ label = "Import transcript" }: { label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { workspaceId, matterId, set } = useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { start, busy } = useTranscriptImport();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    setWorking(true);
    try {
      const typeError = fileTypeError(file);
      if (typeError) throw new Error(typeError);
      if (!workspaceId) throw new Error("No workspace selected");
      let target = matterId;
      if (!target) {
        const { data, error: mErr } = await supabase
          .from("matters")
          .insert({
            workspace_id: workspaceId,
            name: titleFromFile(file.name),
            stage: "Distillation",
            owner_id: user?.id ?? null,
            created_by: user?.id ?? null,
            is_sample: false,
          })
          .select("id")
          .single();
        if (mErr || !data) throw new Error(mErr?.message ?? "Could not start a distillation");
        target = data.id;
        set({ matterId: target });
        await qc.invalidateQueries({ queryKey: ["matters", workspaceId] });
      }
      await start(file, { matterId: target, workspaceId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setWorking(false);
    }
  };

  const disabled = busy || working;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
      <input
        ref={ref}
        type="file"
        accept={ACCEPT_ATTR}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
      <Button variant="primary" disabled={disabled} onClick={() => !disabled && ref.current?.click()}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Upload size={13} strokeWidth={2} />
          {disabled ? "Importing…" : label}
        </span>
      </Button>
    </span>
  );
}
