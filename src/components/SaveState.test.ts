import { describe, expect, it } from "vitest";
import { saveMessage } from "./SaveState";

describe("saveMessage", () => {
  it("names the save model at rest, so it can be discovered before typing", () => {
    expect(saveMessage({ mode: "auto", status: "idle" }).text).toBe("Changes save as you type");
    expect(saveMessage({ mode: "on-blur", status: "idle" }).text).toBe(
      "Changes save when you leave a field",
    );
  });

  it("says nothing at rest where a Save button already answers the question", () => {
    expect(saveMessage({ mode: "manual", status: "idle" }).text).toBe("");
  });

  it("reports progress and completion the same way whatever the model", () => {
    for (const mode of ["auto", "on-blur", "manual"] as const) {
      expect(saveMessage({ mode, status: "saving" }).text).toBe("Saving…");
      expect(saveMessage({ mode, status: "saved" }).text).toBe("Saved");
    }
  });

  it("says what went wrong, and keeps the word 'saved' out of a failure", () => {
    const failed = saveMessage({ mode: "auto", status: "error", error: "Network unreachable." });
    expect(failed.text).toBe("Not saved. Network unreachable.");
    expect(failed.tone).toBe("error");
  });

  it("still admits the failure when nothing explains it", () => {
    expect(saveMessage({ mode: "auto", status: "error" }).text).toBe("Not saved. Try again.");
  });

  it("interrupts for a failure and stays quiet for a success", () => {
    expect(saveMessage({ mode: "auto", status: "error" }).live).toBe("alert");
    expect(saveMessage({ mode: "auto", status: "saved" }).live).toBe("status");
    expect(saveMessage({ mode: "auto", status: "idle" }).live).toBe("off");
  });
});
