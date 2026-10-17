import { describe, expect, it } from "vitest";
import { roleToKind, soloContractKey } from "./intake";

const row = (key: string, role: Parameters<typeof roleToKind>[0]) => ({ key, role });

describe("choosing the contract to review on its own", () => {
  it("finds the single uploaded contract", () => {
    const rows = [row("a", "Original / baseline")];
    expect(soloContractKey(rows, ["a"])).toBe("a");
  });

  it("ignores rows whose upload never landed", () => {
    const rows = [row("a", "Original / baseline"), row("b", "Original / baseline")];
    // The first row failed to upload, so the second is the one with a document.
    expect(soloContractKey(rows, ["b"])).toBe("b");
    expect(soloContractKey(rows, [])).toBeNull();
  });

  it("never picks a transcript, playbook or amendment", () => {
    expect(soloContractKey([row("t", "Transcript")], ["t"])).toBeNull();
    expect(soloContractKey([row("p", "Playbook")], ["p"])).toBeNull();
    expect(soloContractKey([row("a", "Amendment / proposed")], ["a"])).toBeNull();
  });

  it("picks the contract out of a mixed upload", () => {
    const rows = [row("t", "Transcript"), row("c", "Original / baseline"), row("p", "Playbook")];
    expect(soloContractKey(rows, ["t", "c", "p"])).toBe("c");
  });

  it("returns null when nothing was uploaded at all", () => {
    expect(soloContractKey([], [])).toBeNull();
  });
});

describe("recognising a contract", () => {
  it("reads a contract from its name", async () => {
    const { inferRole } = await import("./intake");
    expect(inferRole("Revised Services_Agreement_Nexis_Africa_Alex (1).docx")).toBe(
      "Original / baseline",
    );
    expect(inferRole("Mutual NDA Acme.docx")).toBe("Original / baseline");
    expect(inferRole("Office Lease 2026.pdf")).toBe("Original / baseline");
    expect(inferRole("Background notes.docx")).toBe("Reference");
  });
  it("reads a contract from its words when the name says nothing", async () => {
    const { readsAsContract } = await import("./intake");
    const text =
      "SERVICES AGREEMENT\n\nTHIS AGREEMENT is dated 2026 BETWEEN:\n\n(1) Nexis Africa; and (2) Alex.\n\nIT IS AGREED as follows:";
    expect(readsAsContract(text, 12)).toBe(true);
    expect(readsAsContract(text, 1)).toBe(false);
    expect(readsAsContract("Meeting notes on the agreement with the parties.", 5)).toBe(false);
  });
});
