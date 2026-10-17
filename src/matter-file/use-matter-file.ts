import { useQuery } from "@tanstack/react-query";
import { loadMatterFile } from "./data";

/** The file's flows, tasks and tools, shared by every tab of the file. */
export function useMatterFile(matterId: string | null) {
  return useQuery({
    queryKey: ["matter-file", matterId ?? ""],
    enabled: !!matterId,
    retry: false,
    queryFn: () => loadMatterFile(matterId!),
  });
}
