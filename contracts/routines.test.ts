import { describe, expect, it } from "vitest";
import { repeatsOn, templateSchema } from "./routines";
describe("recurring tasks", () => {
  const daily = { startsOn: "2026-10-30", endsOn: null, weekdays: "1,2,3,4,5,6,7", paused: false };
  it("supports indefinite daily recurrence without a past backlog", () => {
    expect(repeatsOn(daily, "2026-10-29")).toBe(false);
    expect(repeatsOn(daily, "2036-01-01")).toBe(true);
    expect(repeatsOn({ ...daily, paused: true }, "2026-10-30")).toBe(false);
    expect(repeatsOn({ ...daily, weekdays: null }, "2026-10-30")).toBe(false);
  });
  it("honors weekdays and inclusive end dates", () => {
    expect(repeatsOn({ ...daily, weekdays: "1,2,3,4,5" }, "2026-10-31")).toBe(false);
    expect(repeatsOn({ ...daily, endsOn: "2026-10-30" }, "2026-10-30")).toBe(true);
    expect(repeatsOn({ ...daily, endsOn: "2026-10-30" }, "2026-10-31")).toBe(false);
    expect(templateSchema.safeParse({ id: crypto.randomUUID(), title: "Test", startsOn: "2026-10-30", endsOn: "2026-10-29" }).success).toBe(false);
  });
});
