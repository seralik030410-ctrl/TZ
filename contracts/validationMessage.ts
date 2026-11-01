export function validationMessage(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = { agencyGoalCurrency: "Валюта цели", currency: "Валюта", title: "Название", due: "Срок", startMin: "Начало", endMin: "Окончание", subtaskTitles: "Подзадачи" };
  return issues.map(issue => {
    const key = String(issue.path[0] ?? "");
    if (key === "agencyGoalCurrency" || key === "currency") return `${fields[key]}: выберите USD, TJS, RUB, EUR или KZT`;
    return `${fields[key] ?? (key || "Данные")}: ${issue.message}`;
  }).join(". ");
}
