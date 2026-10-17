/**
 * What a call costs.
 *
 * An unpriced call records its tokens and leaves cost null, so the usage
 * pill can say "rates not set" rather than show a confident number that
 * happens to be wrong. A cap enforced against a guessed rate is worse than
 * no cap at all.
 *
 * Rates are US dollars per million tokens. Prices are current public list
 * rates; Gemini 3.7 Flash is on introductory pricing through 31 Dec 2026.
 */

export interface Rate {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Public list rates for models the app can actually invoke.
 *  Gemini 3.7 Flash intro: $0.75 / $3.75 per 1M input/output until 31 Dec 2026.
 *  Claude Sonnet 5: $2 / $10 per 1M input/output.
 *  The Lovable AI gateway bills workspace credits, not dollars, so it has no
 *  rate here and the pill shows tokens for that provider. */
export const RATES: Record<string, Rate> = {
  "gemini-3.7-flash": { inputPerMillion: 0.75, outputPerMillion: 3.75 },
  "claude-sonnet-5": { inputPerMillion: 2.0, outputPerMillion: 10.0 },
};

/** The rate for a model, ignoring any provider prefix such as "google/". */
export function rateFor(model: string): Rate | null {
  const key = model.trim();
  return RATES[key] ?? RATES[key.split("/").pop() ?? key] ?? null;
}

/** Cost in US dollars, or null when this model has no rate set or the
 *  provider bills in a different currency (e.g. Lovable credits). */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  provider?: string,
): number | null {
  // Lovable gateway usage is paid in workspace credits; do not invent a dollar cost.
  if (provider === "lovable") return null;
  const rate = rateFor(model);
  if (!rate) return null;
  const cost =
    (inputTokens / 1_000_000) * rate.inputPerMillion +
    (outputTokens / 1_000_000) * rate.outputPerMillion;
  // Six decimals: a single cheap call can cost less than a hundredth of a cent.
  return Math.round(cost * 1e6) / 1e6;
}

/** True when every model seen has a rate, so totals can be trusted. */
export const ratesConfigured = (models: string[]): boolean =>
  models.length > 0 && models.every((m) => rateFor(m) !== null);
