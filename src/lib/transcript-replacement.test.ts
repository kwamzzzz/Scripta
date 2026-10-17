import { describe, expect, it, vi } from "vitest";
import { replaceTranscriptAfterPopulate } from "@/lib/transcript-replacement";

describe("transcript replacement ordering", () => {
  it("removes the prior transcript only after the replacement is populated", async () => {
    const order: string[] = [];
    const discardReplacement = vi.fn(async () => undefined);

    await expect(
      replaceTranscriptAfterPopulate({
        createReplacement: async () => {
          order.push("create");
          return { id: "replacement" };
        },
        populateReplacement: async () => {
          order.push("populate");
        },
        removePrior: async () => {
          order.push("remove-prior");
        },
        discardReplacement,
      }),
    ).resolves.toEqual({ id: "replacement" });

    expect(order).toEqual(["create", "populate", "remove-prior"]);
    expect(discardReplacement).not.toHaveBeenCalled();
  });

  it("keeps the prior transcript and discards a replacement that fails to populate", async () => {
    const order: string[] = [];
    const removePrior = vi.fn(async () => undefined);

    await expect(
      replaceTranscriptAfterPopulate({
        createReplacement: async () => ({ id: "replacement" }),
        populateReplacement: async () => {
          order.push("populate");
          throw new Error("point insert failed");
        },
        removePrior,
        discardReplacement: async () => {
          order.push("discard-replacement");
        },
      }),
    ).rejects.toThrow("point insert failed");

    expect(order).toEqual(["populate", "discard-replacement"]);
    expect(removePrior).not.toHaveBeenCalled();
  });

  it("discards the replacement when removing the prior transcript fails", async () => {
    const order: string[] = [];

    await expect(
      replaceTranscriptAfterPopulate({
        createReplacement: async () => ({ id: "replacement" }),
        populateReplacement: async () => {
          order.push("populate");
        },
        removePrior: async () => {
          order.push("remove-prior");
          throw new Error("prior delete failed");
        },
        discardReplacement: async () => {
          order.push("discard-replacement");
        },
      }),
    ).rejects.toThrow("prior delete failed");

    expect(order).toEqual(["populate", "remove-prior", "discard-replacement"]);
  });

  it("reports both the original and cleanup failures", async () => {
    await expect(
      replaceTranscriptAfterPopulate({
        createReplacement: async () => ({ id: "replacement" }),
        populateReplacement: async () => {
          throw new Error("point insert failed");
        },
        removePrior: async () => undefined,
        discardReplacement: async () => {
          throw new Error("replacement delete failed");
        },
      }),
    ).rejects.toThrow(
      "point insert failed The incomplete replacement also could not be removed: replacement delete failed",
    );
  });
});
