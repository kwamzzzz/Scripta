import { describe, expect, it } from "vitest";
import { periodLabel, periodStart, taskTitle } from "./planner";

describe("planner", () => {
  it("files an entry under the start of its period", () => {
    expect(periodStart("day", "2026-09-18")).toBe("2026-09-18");
    expect(periodStart("month", "2026-09-18")).toBe("2026-09-01");
    expect(periodStart("year", "2026-09-18")).toBe("2026-01-01");
    expect(periodStart("open", "2026-09-18")).toBeNull();
  });

  it("names the period", () => {
    expect(periodLabel("day", "2026-09-18")).toBe("Friday 18 September 2026");
    expect(periodLabel("month", "2026-09-01")).toBe("September 2026");
    expect(periodLabel("year", "2026-01-01")).toBe("2026");
    expect(periodLabel("open", null)).toBe("Strategic plan");
  });

  it("turns a line into a task name without its bullet, box or time", () => {
    expect(taskTitle("- Call Bugatti re structure")).toBe("Call Bugatti re structure");
    expect(taskTitle("• [ ] 9:30 Call Bugatti")).toBe("Call Bugatti");
    expect(taskTitle("2. Read the UAE memo")).toBe("Read the UAE memo");
    expect(taskTitle("10am - partner catch-up")).toBe("partner catch-up");
    expect(taskTitle("Finish the Ocorian reply")).toBe("Finish the Ocorian reply");
  });
});
