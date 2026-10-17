import { describe, expect, it } from "vitest";
import { effectiveStatus, statusLabel, type InviteStatus } from "./invites";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("an invitation's real status", () => {
  it("is pending while the date is still ahead", () => {
    expect(effectiveStatus({ status: "pending", expiresAt: inDays(3) })).toBe("pending");
  });

  /* Nothing sweeps the table on a schedule, so a row can sit at 'pending' long
     after it stopped meaning anything. The list must not offer "copy link" for
     a link that will be refused. */
  it("is expired once the date has passed, whatever the column says", () => {
    expect(effectiveStatus({ status: "pending", expiresAt: inDays(-1) })).toBe("expired");
  });

  it("leaves a closed invitation closed, even one that has also lapsed", () => {
    expect(effectiveStatus({ status: "revoked", expiresAt: inDays(-30) })).toBe("revoked");
    expect(effectiveStatus({ status: "accepted", expiresAt: inDays(-30) })).toBe("accepted");
    expect(effectiveStatus({ status: "superseded", expiresAt: inDays(-30) })).toBe("superseded");
  });

  it("has words for every state the database can produce", () => {
    const all: InviteStatus[] = ["pending", "accepted", "revoked", "expired", "superseded"];
    for (const s of all) expect(statusLabel[s]).toBeTruthy();
  });
});
