export type TranscriptReplacement<T> = {
  createReplacement: () => Promise<T>;
  populateReplacement: (replacement: T) => Promise<void>;
  removePrior: (replacement: T) => Promise<void>;
  discardReplacement: (replacement: T) => Promise<void>;
};

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

/**
 * Keep the prior transcript intact until its replacement is fully populated.
 * If population or the final swap fails, remove the incomplete replacement.
 */
export async function replaceTranscriptAfterPopulate<T>({
  createReplacement,
  populateReplacement,
  removePrior,
  discardReplacement,
}: TranscriptReplacement<T>): Promise<T> {
  const replacement = await createReplacement();

  try {
    await populateReplacement(replacement);
    await removePrior(replacement);
    return replacement;
  } catch (failure) {
    try {
      await discardReplacement(replacement);
    } catch (cleanupFailure) {
      throw new Error(
        `${messageOf(failure)} The incomplete replacement also could not be removed: ${messageOf(cleanupFailure)}`,
      );
    }
    throw failure;
  }
}
