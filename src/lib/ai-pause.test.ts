import { describe, expect, it } from "vitest";
import { assertAiAllowed } from "./ai-gateway.server";

/** A stand-in for the request's database client: the AI flag row and the
 *  administrators table, nothing else. */
function actor(flag: { enabled: boolean; preview_users?: string[] } | null, admins: string[] = []) {
  return {
    userId: "u1",
    supabase: {
      from: (table: string) => ({
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => ({
              data:
                table === "feature_flags"
                  ? flag
                  : admins.includes(value)
                    ? { user_id: value }
                    : null,
            }),
          }),
        }),
      }),
    },
  };
}

describe("the AI pause", () => {
  it("lets AI run when no one has touched the switch, or it is on", async () => {
    await expect(assertAiAllowed(actor(null))).resolves.toBeUndefined();
    await expect(assertAiAllowed(actor({ enabled: true }))).resolves.toBeUndefined();
  });
  it("refuses a member while AI is paused", async () => {
    await expect(assertAiAllowed(actor({ enabled: false }))).rejects.toThrow(/paused/);
  });
  it("lets administrators and early-access people carry on", async () => {
    await expect(assertAiAllowed(actor({ enabled: false }, ["u1"]))).resolves.toBeUndefined();
    await expect(
      assertAiAllowed(actor({ enabled: false, preview_users: ["u1"] })),
    ).resolves.toBeUndefined();
  });
  it("does nothing for a call with no one behind it", async () => {
    await expect(assertAiAllowed(undefined)).resolves.toBeUndefined();
  });
});
