/** Hooks the register screens share. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { parseDocument } from "@/lib/documents.functions";
import { organisationKey } from "../db";
import type { Organisation } from "../model";
import { readRecordFields, type ReadField } from "../read-fields.functions";
import { loadOrgTasks } from "../work";
import type { Proposal } from "./register";

/** The tasks this person raised from these records. */
export function useOrgTasks(org: Organisation, originIds: string[]) {
  return useQuery({
    queryKey: ["org-tasks", org.clientId, originIds.slice().sort().join(",")],
    retry: false,
    queryFn: () => loadOrgTasks(org.workspaceId, originIds),
  });
}

export function useReadFields() {
  const parse = useServerFn(parseDocument);
  const read = useServerFn(readRecordFields);
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "parsing" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async (
    org: Organisation,
    documentId: string,
    fields: ReadField[],
    context?: string,
  ): Promise<Proposal[] | null> => {
    setError(null);
    try {
      const doc = org.documents.find((d) => d.id === documentId);
      if (doc?.parseStatus !== "parsed") {
        setState("parsing");
        const parsed = await parse({ data: { documentId } });
        if (!parsed.ok) throw new Error(parsed.error);
        await qc.invalidateQueries({ queryKey: organisationKey(org.clientId) });
      }
      setState("reading");
      const result = await read({ data: { documentId, fields, context } });
      if (!result.ok) throw new Error(result.error);
      return result.fields.map((f) => ({
        key: f.key,
        value: f.value,
        confidence: f.confidence,
        page: f.page,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be read.");
      return null;
    } finally {
      setState("idle");
    }
  };

  return { run, state, error, setError };
}
