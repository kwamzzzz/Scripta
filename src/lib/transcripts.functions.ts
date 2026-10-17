import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blocksToText } from "@/lib/parsing/blocks";
import { extOf } from "@/lib/parsing/mime";
import { extract } from "@/lib/documents.functions";
import { otterHeaderMeta, parseTranscriptText, type Utterance } from "@/lib/parsing/transcript";
import { replaceTranscriptAfterPopulate } from "@/lib/transcript-replacement";

const BUCKET = "matter-documents";
const PLAIN = [".txt", ".md", ".vtt", ".srt"];

export type SpeakerRole = "Client" | "Vendor" | "Legal" | "Security" | "Other";
export type SpeakerMapping = Record<string, { name: string; role: SpeakerRole }>;

/** How the speaker attribution on a transcript was arrived at. A lawyer tracing a
 *  resolution back to who said what needs to know how reliable it is. */
export type Attribution = "file" | "manual" | "inferred";

export const ATTRIBUTION_LABEL: Record<Attribution, string> = {
  file: "Speakers from source file",
  manual: "Speakers assigned manually",
  inferred: "Speakers inferred",
};

async function rawText(name: string, buf: ArrayBuffer): Promise<string> {
  const ext = extOf(name);
  if (PLAIN.includes(ext)) return new TextDecoder().decode(buf);
  const { blocks } = await extract(ext, buf);
  return blocksToText(blocks);
}

/**
 * Parse an uploaded transcript into utterances. Nothing is committed here —
 * the speaker mapping panel runs first, because Otter gives a name at best and
 * never a role.
 */
export const parseTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("documents")
      .select("id, name, matter_id, storage_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc?.storage_path) throw new Error("Transcript file not found");

    await supabase
      .from("documents")
      .update({ parse_status: "parsing", parse_error: null })
      .eq("id", doc.id);

    try {
      const file = await supabase.storage.from(BUCKET).download(doc.storage_path);
      if (file.error || !file.data) throw new Error(file.error?.message ?? "Download failed");
      // doc.name is the display name with the extension stripped, so the
      // extension has to come from the storage path.
      const text = await rawText(doc.storage_path, await file.data.arrayBuffer());
      const parsed = parseTranscriptText(text);
      // Otter states the real title, date and length in its header; without this
      // the app falls back to the filename and the upload date.
      const meta = otterHeaderMeta(text);

      await supabase
        .from("documents")
        .update({
          parse_status: "parsed",
          parse_error: null,
          parsed_text: text,
          parsed_blocks: parsed.utterances as unknown as never,
          structure_detected: true,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      // Reuse the mapping from an earlier import of the same meeting.
      const { data: prior } = await supabase
        .from("transcripts")
        .select("speaker_map")
        // A transcript is always imported onto a matter.
        .eq("matter_id", doc.matter_id as string)
        .order("created_at", { ascending: false });
      const known: SpeakerMapping = {};
      for (const row of [...(prior ?? [])].reverse())
        Object.assign(known, (row.speaker_map ?? {}) as SpeakerMapping);

      return {
        ok: true as const,
        format: parsed.format,
        speakers: parsed.speakers,
        utterances: parsed.utterances.map((u) => ({
          speakerKey: u.speakerKey,
          speakerName: u.speakerName,
          ts: u.ts,
          text: u.text,
        })),
        utteranceCount: parsed.utterances.length,
        durationMinutes: meta.durationMinutes ?? parsed.durationMinutes,
        suggestedTitle: meta.title,
        suggestedDate: meta.date,
        known,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not read the transcript";
      await supabase
        .from("documents")
        .update({ parse_status: "failed", parse_error: message })
        .eq("id", doc.id);
      return { ok: false as const, error: message };
    }
  });

/** Commit the mapped transcript: transcripts row + discussion_points + audit event. */
export const commitTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      documentId: string;
      matterId: string;
      meetingTitle: string;
      meetingDate: string;
      /** negotiation · board · hearing · deposition · interview · diligence · internal */
      meetingKind?: string;
      mapping: SpeakerMapping;
      /** Per-utterance speaker keys from the turn-assignment panel, in order. */
      assignments?: string[];
      /** How the attribution was arrived at — surfaced on the Transcript header. */
      attribution?: Attribution;
    }) => input,
  )

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc } = await supabase
      .from("documents")
      .select("id, name, matter_id, parsed_blocks, doc_date")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc) throw new Error("Transcript document not found");

    const utterances = (doc.parsed_blocks ?? []) as unknown as Utterance[];
    if (!Array.isArray(utterances) || utterances.length === 0)
      throw new Error("This transcript has not been parsed yet");

    const keyAt = (u: Utterance, i: number) => data.assignments?.[i] ?? u.speakerKey;
    const label = (u: Utterance, i: number) =>
      data.mapping[keyAt(u, i)] ?? { name: u.speakerName ?? keyAt(u, i), role: "Other" as const };
    const speakerCount = new Set(utterances.map((u, i) => label(u, i).name)).size;
    // The people in the meeting, as far as anyone has named them: a name the
    // lawyer typed, or a real name the recorder used as a label. These are
    // who the distiller may attribute to; the labels themselves stay hints.
    const participants: { key: string; name: string; source: "lawyer" | "detected" }[] = [];
    for (const [key, m] of Object.entries(data.mapping)) {
      const name = m.name.trim();
      // A generic label is not a person; a real name the recorder used is.
      if (!name || /^speaker\s*\d+$/i.test(name)) continue;
      if (participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) continue;
      const fromFile = utterances.some((u) => u.speakerKey === key && u.speakerName === name);
      participants.push({
        key: `p${participants.length + 1}`,
        name,
        source: fromFile ? "detected" : "lawyer",
      });
    }
    const maxSeconds = Math.max(...utterances.map((u) => u.seconds ?? 0));
    const durationMinutes = Math.max(1, Math.round(maxSeconds / 60));

    // Snapshot exactly which rows this replacement may remove. The old record
    // remains authoritative until the new record and all its points exist.
    const { data: prior, error: priorErr } = await supabase
      .from("transcripts")
      .select("id")
      .eq("document_id", doc.id);
    if (priorErr) throw new Error(priorErr.message);
    const priorIds = (prior ?? []).map((row) => row.id);

    const tr = await replaceTranscriptAfterPopulate({
      createReplacement: async () => {
        const { data: replacement, error: trErr } = await supabase
          .from("transcripts")
          .insert({
            matter_id: data.matterId,
            document_id: doc.id,
            meeting_title: data.meetingTitle || doc.name,
            meeting_date: data.meetingDate || doc.doc_date,
            duration_minutes: durationMinutes,
            source_label: "Otter.ai",
            speaker_count: speakerCount,
            speaker_map: data.mapping as unknown as never,
            participants: participants as unknown as never,
            attribution: data.attribution ?? "file",
            meeting_kind: data.meetingKind ?? "negotiation",
          })
          .select("id")
          .single();
        if (trErr || !replacement)
          throw new Error(trErr?.message ?? "Could not create the transcript");
        return replacement;
      },
      populateReplacement: async (replacement) => {
        const rows = utterances.map((u, i) => {
          const m = label(u, i);
          return {
            transcript_id: replacement.id,
            timestamp_label: u.ts,
            speaker_name: m.name,
            speaker_role: m.role,
            // What the recorder said, kept verbatim beside the display name.
            speaker_label: u.speakerName ?? u.speakerKey,
            seconds: u.seconds ?? null,
            text: u.text,
            ordinal: i + 1,
          };
        });
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase.from("discussion_points").insert(rows.slice(i, i + 200));
          if (error) throw new Error(error.message);
        }
      },
      removePrior: async () => {
        if (priorIds.length === 0) return;
        const { error } = await supabase.from("transcripts").delete().in("id", priorIds);
        if (error) throw new Error(error.message);
      },
      discardReplacement: async (replacement) => {
        const { error } = await supabase.from("transcripts").delete().eq("id", replacement.id);
        if (error) throw new Error(error.message);
      },
    });

    const pointCount = utterances.length;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const how = ATTRIBUTION_LABEL[data.attribution ?? "file"];
    await supabase.from("audit_events").insert({
      matter_id: data.matterId,
      actor_id: userId,
      actor_name: profile?.full_name ?? profile?.email ?? "Unknown",
      event_type: "transcript.imported",
      entity_type: "transcript",
      entity_id: tr.id,
      summary: `${data.meetingTitle || doc.name} — transcript imported from Otter.ai · ${pointCount} discussion points, ${speakerCount} speakers · ${how.toLowerCase()}`,
      metadata: {
        document_id: doc.id,
        points: pointCount,
        speakers: speakerCount,
        attribution: data.attribution ?? "file",
      },
    });

    return { transcriptId: tr.id, points: pointCount };
  });

/**
 * Optional accelerant for unlabelled captions: ask the model where the turns are.
 * It never commits anything — the result is shown as clearly-marked guesses in the
 * turn-assignment table, because attributing a statement to the wrong person in a
 * legal record is a real harm, not a cosmetic error.
 */
export const suggestSpeakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { documentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("documents")
      .select("id, parsed_blocks")
      .eq("id", data.documentId)
      .maybeSingle();
    const utterances = (doc?.parsed_blocks ?? []) as unknown as Utterance[];
    if (!Array.isArray(utterances) || utterances.length === 0)
      return { ok: false as const, error: "This transcript has not been parsed yet" };

    const numbered = utterances.map((u, i) => `${i}. [${u.ts}] ${u.text}`).join("\n");

    try {
      const { callStructured, GatewayError } = await import("@/lib/ai-gateway.server");
      try {
        const out = await callStructured<{ speaker_count: number; turn_starts: number[] }>({
          feature: "transcript-speakers",
          actor: { supabase, userId },
          system:
            "You analyse meeting transcripts that have no speaker labels. Using conversational cues only — question and answer adjacency, self-reference, role language, topic hand-offs — estimate how many distinct speakers there are and which utterance indices begin a new speaker turn. Never rewrite, quote or summarise the text. Index 0 always begins a turn.",
          user: `Utterances:\n${numbered}`,
          toolName: "propose_turns",
          toolDescription:
            "Propose the number of distinct speakers and the indices where a new speaker turn begins.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              speaker_count: { type: "integer", minimum: 1, maximum: 12 },
              turn_starts: { type: "array", items: { type: "integer", minimum: 0 } },
            },
            required: ["speaker_count", "turn_starts"],
          },
        });

        // Trust nothing: clamp the count and drop any index outside the set we sent.
        const count = Math.max(
          1,
          Math.min(Math.min(12, utterances.length), Math.round(out.speaker_count || 1)),
        );
        const starts = Array.from(
          new Set(
            (out.turn_starts ?? [])
              .filter((n) => Number.isInteger(n) && n >= 0 && n < utterances.length)
              .concat(0),
          ),
        ).sort((a, b) => a - b);

        let turn = -1;
        const assignments = utterances.map((_, i) => {
          if (starts.includes(i)) turn += 1;
          return `Speaker ${(Math.max(0, turn) % count) + 1}`;
        });
        return { ok: true as const, speakerCount: count, assignments };
      } catch (e) {
        if (e instanceof GatewayError) return { ok: false as const, error: e.message };
        throw e;
      }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Could not suggest speakers",
      };
    }
  });
