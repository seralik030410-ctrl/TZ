import { expect, it } from "vitest";
import { completion } from "./completion";
it("recalculates progress as checkboxes change without using focus time", () => {
  expect(completion([{ status: "done" }, { status: "plan" }])).toEqual({ done: 1, total: 2, percent: 50 });
  expect(completion([{ status: "done" }, { status: "done" }]).percent).toBe(100);
  expect(completion([{ status: "plan" }, { status: "done" }]).percent).toBe(50);
});
it("includes paid bills as completed items and ignores archived items", () => {
  expect(completion([{ status: "done" }, { status: "plan" }, { status: "done", isDeleted: true }])).toEqual({ done: 1, total: 2, percent: 50 });
  expect(completion([])).toEqual({ done: 0, total: 0, percent: 0 });
});
