import { expect, it } from "vitest";
import { tradeFormSchema } from "./gold";
import { recordFieldValue } from "./recordForm";

const quickResult = { id: "00000000-0000-4000-8000-000000000001", date: "2026-11-01T09:00:00+05:00", direction: "", size: "", entry: "", exit: "", riskPercent: "", result: 2500, currency: "USD", reason: "", comment: "Исправлен комментарий", status: "closed" };
it("edits a quick closed result without inventing trade details", () => {
  expect(tradeFormSchema.parse(quickResult)).toMatchObject({ direction: null, size: null, entry: null, exit: null, riskPercent: null, comment: quickResult.comment });
});
it("still rejects missing details on an open trade", () => {
  expect(tradeFormSchema.safeParse({ ...quickResult, status: "open" }).success).toBe(false);
});
it("preserves explicit nulls and zeroes when displaying an existing record", () => {
  expect(recordFieldValue({ size: null }, "size", "0.01")).toBe("");
  expect(recordFieldValue({ result: 0 }, "result", 100)).toBe(0);
  expect(recordFieldValue(undefined, "size", "0.01")).toBe("0.01");
});
