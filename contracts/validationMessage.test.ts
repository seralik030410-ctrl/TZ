import { expect, it } from "vitest";
import { validationMessage } from "./validationMessage";
it("turns the reported currency error into a useful field message", () => {
  expect(validationMessage([{ path: ["agencyGoalCurrency"], message: 'Invalid option: expected one of "USD"|"TJS"|"RUB"|"EUR"|"KZT"' }])).toBe("Валюта цели: выберите USD, TJS, RUB, EUR или KZT");
});
