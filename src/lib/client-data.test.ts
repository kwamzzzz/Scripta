import { describe, expect, it } from "vitest";
import { clearPraxisClientData, migratePraxisClientData } from "./client-data";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Praxis browser data cleanup", () => {
  it("removes Praxis state without removing the Supabase session", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("px.research.simple", "worked example");
    local.setItem("sb-project-auth-token", "session");
    session.setItem("px.assistant.demo", "messages");

    clearPraxisClientData(local, session);

    expect(local.getItem("px.research.simple")).toBeNull();
    expect(session.getItem("px.assistant.demo")).toBeNull();
    expect(local.getItem("sb-project-auth-token")).toBe("session");
  });

  it("runs the release cleanup once", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("px.editor.legacy", "draft");

    migratePraxisClientData(local, session);
    local.setItem("px.editor.current", "draft");
    migratePraxisClientData(local, session);

    expect(local.getItem("px.editor.legacy")).toBeNull();
    expect(local.getItem("px.editor.current")).toBe("draft");
  });
});
