export type TranscriptTarget = {
  matterId: string;
  workspaceId: string;
};

export type TranscriptTargetOverride = Partial<TranscriptTarget>;

/**
 * Resolve the destination at the moment an import starts. Callers that have just
 * created a matter can pass it directly instead of waiting for React state to
 * re-render and refresh the import callback's closure.
 */
export function resolveTranscriptTarget(
  selected: { matterId: string | null; workspaceId: string | null },
  override: TranscriptTargetOverride = {},
): TranscriptTarget {
  const matterId = override.matterId ?? selected.matterId;
  const workspaceId = override.workspaceId ?? selected.workspaceId;

  if (!workspaceId) throw new Error("No workspace selected");
  if (!matterId) throw new Error("Choose a matter before importing a transcript.");

  return { matterId, workspaceId };
}
