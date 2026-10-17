import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Client } from "@/lib/clients";
import { loadMarketing, marketingKey } from "./db";
import type { Marketing, MarketingLevel, MarketingView } from "./model";

export function useMarketing(workspaceId: string | null, clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: marketingKey(clientId),
    enabled: !!workspaceId && enabled,
    retry: false,
    queryFn: () => loadMarketing(workspaceId!, clientId),
  });
}

/** Run a write, keep the refusal in words, and reload the client's marketing. */
export function useMarketingWrite(clientId: string) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That change was not saved.");
      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: marketingKey(clientId) });
      setBusy(false);
    }
  };
  return { run, error, setError, busy };
}

export type MarketingGo = (to: { view?: MarketingView; item?: string | null }) => void;

export type SectionProps = {
  m: Marketing;
  client: Client;
  level: MarketingLevel;
  item: string | null;
  go: MarketingGo;
};
