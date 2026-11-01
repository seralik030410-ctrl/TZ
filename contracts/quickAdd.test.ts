import { expect, it } from "vitest";
import { categoryForKind, taskScheduleLink } from "./quickAdd";

it("replaces an expense-only category when switching to income", () => {
  expect(categoryForKind("Еда", "income")).toBe("Прочее");
  expect(categoryForKind("Проекты", "income")).toBe("Проекты");
  expect(categoryForKind("", "expense")).toBe("Прочее");
});
it("never submits a hidden personal schedule link for a shared task", () => {
  expect(taskScheduleLink("class-id", "shared-workspace")).toBeNull();
  expect(taskScheduleLink("class-id", null)).toBe("class-id");
  expect(taskScheduleLink("", null)).toBeNull();
});
