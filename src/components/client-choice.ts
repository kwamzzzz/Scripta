/** The answer the client picker gives, and the query every picker shares. */
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/store/app";
import { clientsQueryKey, listClients } from "@/lib/clients";

export type ClientChoice =
  { kind: "none" } | { kind: "existing"; id: string; name: string } | { kind: "new"; name: string };

export const NO_CLIENT: ClientChoice = { kind: "none" };

export function useClients() {
  const { workspaceId } = useApp();
  return useQuery({
    queryKey: clientsQueryKey(workspaceId),
    enabled: !!workspaceId,
    retry: false,
    queryFn: () => listClients(workspaceId!),
  });
}
