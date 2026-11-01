import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { selectOptions } from "../src/lib/selectOptions";

describe("native option values in AppSelect", () => {
  it("uses the text of options with no value, keeping income categories distinct", () => {
    const options = ["Проекты", "Агентство", "Прочее"].map(label => h("option", { key: label }, label));
    expect(selectOptions(options).map(o => o.value)).toEqual(["Проекты", "Агентство", "Прочее"]);
  });
  it("preserves explicit empty, numeric and project ID values", () => {
    expect(selectOptions([h("option", { value: "" }, "Без проекта"), h("option", { value: 0 }, "Ноль"), h("option", { value: "project-id" }, "AZ Plus")]).map(o => o.value)).toEqual(["", "0", "project-id"]);
  });
  it("supports fragments, groups and text assembled from children", () => {
    expect(selectOptions(h(Fragment, null, h("optgroup", { label: "Валюты" }, h("option", null, "T", "JS"))))[0].value).toBe("TJS");
  });
});
