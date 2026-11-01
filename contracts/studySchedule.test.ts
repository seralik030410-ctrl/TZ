import { expect, it } from "vitest";
import { studySchedule } from "./studySchedule";
it("has two class blocks on every Monday–Saturday through December 31 and no Sunday classes", () => {
  const rows = studySchedule();
  expect(rows.filter(r => r.kind === "class")).toHaveLength(104);
  expect(rows.every(r => new Date(`${r.onDate}T12:00:00Z`).getUTCDay() !== 0)).toBe(true);
  expect(rows.filter(r => r.onDate === "2026-12-31")).toHaveLength(2);
  expect(rows.some(r => r.onDate > "2026-12-31")).toBe(false);
});
it("has a one-hour Koreo appointment at 09:00 on all nine Mondays", () => {
  const koreo = studySchedule().filter(r => r.kind === "work");
  expect(koreo).toHaveLength(9);
  expect(koreo.every(r => r.startMin === 540 && r.endMin === 600 && new Date(`${r.onDate}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
});
