import { expect, it } from "vitest";
import { projectUpdateSchema } from "./projects";
it("updates a saved project's amount and deadline without recording actual income", () => {
  expect(projectUpdateSchema.parse({ id: "project", name: "AZ Plus", expectedIncome: 250000, deadline: "2026-11-03" })).toMatchObject({ expectedIncome: 250000, deadline: "2026-11-03" });
  expect(projectUpdateSchema.safeParse({ id: "project", expectedIncome: -1 }).success).toBe(false);
  expect(projectUpdateSchema.safeParse({ id: "project", deadline: "2026-02-30" }).success).toBe(false);
});
