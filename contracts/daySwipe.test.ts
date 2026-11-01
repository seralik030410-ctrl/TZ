import { expect, it } from "vitest";
import { daySwipe } from "./daySwipe";
import { addCalendarDays } from "./shared";
it("moves forward on left swipe and back on right swipe", () => {
  expect(daySwipe(-100, 10, 300)).toBe(1);
  expect(daySwipe(100, 10, 300)).toBe(-1);
  expect(addCalendarDays("2026-12-31", daySwipe(-100, 0, 200))).toBe("2027-01-01");
});
it("ignores taps, vertical scrolling, diagonals and long drags", () => {
  expect(daySwipe(20, 0, 100)).toBe(0);
  expect(daySwipe(80, 150, 200)).toBe(0);
  expect(daySwipe(80, 70, 200)).toBe(0);
  expect(daySwipe(100, 0, 1000)).toBe(0);
});
