/**
 * Risk scoring for the research matter (wireframe 4j). Ratings come from
 * likelihood × impact; a lawyer can override one, and the action plan is the
 * same risk records seen from the client's side.
 */
export const LIKELIHOOD = ["Unlikely", "Possible", "Likely", "Almost certain"];
export const IMPACT = ["Low", "Moderate", "Major", "Severe"];
export const RATINGS = ["Low", "Medium", "High", "Critical"];
export const STATUSES = ["Open", "In progress", "Done"];

export function ratingOf(like: string, imp: string): string {
  const score =
    (Math.max(LIKELIHOOD.indexOf(like), 0) + 1) * (Math.max(IMPACT.indexOf(imp), 0) + 1);
  return score <= 2 ? "Low" : score <= 6 ? "Medium" : score <= 9 ? "High" : "Critical";
}

export function priorityOf(rating: string): string {
  return rating === "Critical" ? "Immediate" : rating === "Low" ? "Monitor" : "Short term";
}

export function next<T>(list: readonly T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length]!;
}
