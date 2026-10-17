import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV,
  NAV_FOOTER,
  SECTION_KEYS,
  SECTION_NAME,
  flattenNavItems,
  isNavParent,
} from "@/lib/app-navigation";

function canonical(path: string): string {
  return path === "/" ? path : path.replace(/\/$/, "");
}

function declaredRoutes(): Set<string> {
  const directory = resolve(process.cwd(), "src/routes");
  const routes = readdirSync(directory)
    .filter((name) => name.endsWith(".tsx"))
    .flatMap((name) => {
      const source = readFileSync(resolve(directory, name), "utf8");
      return [...source.matchAll(/createFileRoute\("([^"]+)"\)/g)].map((match) =>
        canonical(match[1]!),
      );
    });
  return new Set(routes);
}

describe("application navigation model", () => {
  it("names every section as a place", () => {
    expect(Object.keys(SECTION_NAME).sort()).toEqual([...SECTION_KEYS].sort());
    for (const key of SECTION_KEYS) expect(SECTION_NAME[key].trim()).not.toBe("");
  });

  /* Matters and Contract Review are two different places: a matter is a file,
     and Contract Review is one of the tools that may be used on it. They were
     the same entry until the matter got its own tab, and each now points at its
     own route. */
  it("keeps Matters and Contract Review as separate destinations", () => {
    expect(SECTION_NAME.matters).toBe("Matters");
    expect(SECTION_NAME["contract-review"]).toBe("Contract Review");
    expect(flattenNavItems(NAV).find((item) => item.key === "matters")).toMatchObject({
      label: SECTION_NAME.matters,
      to: "/matters",
    });
    expect(flattenNavItems(NAV).find((item) => item.key === "contract-review")).toMatchObject({
      label: SECTION_NAME["contract-review"],
      to: "/matters/review",
    });
  });

  it("points every navigation item at a declared route", () => {
    const routes = declaredRoutes();
    const missing = [...flattenNavItems(NAV), ...NAV_FOOTER]
      .filter((item) => !routes.has(canonical(item.to)))
      .map((item) => `${item.label}: ${item.to}`);

    expect(missing).toEqual([]);
  });

  it("reads the work, then the tools, then what the firm reuses, then admin", () => {
    expect(NAV.map((group) => group.label)).toEqual(["WORKSPACE", "TOOLS", "KNOWLEDGE", "ADMIN"]);
    const labels = (name: string) =>
      NAV.find((group) => group.label === name)!.items.map((entry) => entry.label);
    // What needs doing, who it is for, the files opened for them, how the work runs.
    expect(labels("WORKSPACE")).toEqual(["Dashboard", "Tasks", "Clients", "Matters", "Manuscripts", "Flow"]);
    // Every tool in view, none folded away: Scripta is used on large screens.
    expect(labels("TOOLS")).toEqual([
      "Contract Drafting",
      "Contract Review",
      "Legal Research",
      "Corporate Drafting",
      "Transcript distiller",
    ]);
    expect(NAV.flatMap((group) => group.items).some(isNavParent)).toBe(false);
    // Most-opened first. Tasks is not something the firm reuses, so not here.
    // Career sits at the end of the group: it is kept rather than done, but it
    // is the lawyer's own rather than the firm's.
    expect(labels("KNOWLEDGE")).toEqual([
      "Library",
      "Precedents",
      "Templates",
      "Playbooks",
      "Learning",
      "Career",
    ]);
    expect(labels("ADMIN")).toEqual(["Admin portal"]);
  });

  it("keeps housekeeping and settings apart, at the foot", () => {
    expect(NAV_FOOTER.map((item) => item.label)).toEqual([
      "Archive",
      "Recently Deleted",
      "Settings",
    ]);
    const inGroups = flattenNavItems(NAV).map((item) => item.key);
    for (const item of NAV_FOOTER) expect(inGroups).not.toContain(item.key);
  });

  it("has no empty parent, duplicate key or duplicate destination", () => {
    const parents = NAV.flatMap((group) => group.items).filter(isNavParent);
    expect(parents.every((parent) => parent.children.length > 0)).toBe(true);

    const items = [...flattenNavItems(NAV), ...NAV_FOOTER];
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(new Set(items.map((item) => canonical(item.to))).size).toBe(items.length);
  });
});
