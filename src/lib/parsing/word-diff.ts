export type SegKind = "n" | "d" | "i";
export type DiffSeg = { t: string; k: SegKind };

/**
 * Tokenise into words that carry their own trailing whitespace, so joining
 * tokens reproduces the source string byte-for-byte.
 */
export function tokenize(text: string): string[] {
  // Every token ends with a space so concatenation never fuses two words when
  // an unchanged run is followed by an insertion.
  return (text.match(/\S+/g) ?? []).map((w) => `${w} `);
}

const key = (tok: string) => tok.trim();

/** Collapse whitespace so the round-trip property is exact, not whitespace-approximate. */
export const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Word-level LCS. Character diffs shred legal prose; word runs stay readable.
 * Emits segments in reading order such that:
 *   segs(n + d).join("") === normalizeText(original)
 *   segs(n + i).join("") === normalizeText(amendment)
 */
export function wordDiff(originalRaw: string, amendmentRaw: string): DiffSeg[] {
  const original = normalizeText(originalRaw);
  const amendment = normalizeText(amendmentRaw);
  const a = tokenize(original);
  const b = tokenize(amendment);

  const n = a.length;
  const m = b.length;

  // LCS table (documents are chunked per clause, so this stays small).
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = key(a[i]!) === key(b[j]!) ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const segs: DiffSeg[] = [];
  const push = (k: SegKind, t: string) => {
    if (!t) return;
    const last = segs[segs.length - 1];
    if (last && last.k === k) last.t += t;
    else segs.push({ k, t });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]!) === key(b[j]!)) {
      // Keep the amendment's spacing for unchanged runs; word text is identical.
      push("n", a[i]!);
      i++;
      j++;
      continue;
    }
    // Collect the whole change region, deletions first, then insertions.
    const di = i;
    const dj = j;
    while (i < n && j < m && key(a[i]!) !== key(b[j]!)) {
      if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
      else j++;
    }
    for (let x = di; x < i; x++) push("d", a[x]!);
    for (let y = dj; y < j; y++) push("i", b[y]!);
  }
  for (let x = i; x < n; x++) push("d", a[x]!);
  for (let y = j; y < m; y++) push("i", b[y]!);

  return segs;
}

export const rebuildOriginal = (segs: DiffSeg[]) =>
  segs.filter((s) => s.k !== "i").map((s) => s.t).join("").trimEnd();

export const rebuildAmendment = (segs: DiffSeg[]) =>
  segs.filter((s) => s.k !== "d").map((s) => s.t).join("").trimEnd();
