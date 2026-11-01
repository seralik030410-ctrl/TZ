import { Children, isValidElement, type ReactNode } from "react";

function optionText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : "").join("");
}

export function selectOptions(children: ReactNode): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    // Native <option> uses its text when value is omitted. An explicit empty
    // value is still meaningful for optional fields such as "Без проекта".
    return child.type === "option" ? [{ value: String(child.props.value ?? optionText(child.props.children)), label: child.props.children, disabled: child.props.disabled }] : selectOptions(child.props.children);
  });
}
