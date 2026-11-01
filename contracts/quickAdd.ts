export function moneyCategories(kind: "expense" | "income") {
  return kind === "income" ? ["Проекты", "Агентство", "Прочее"] : ["Еда", "Обед", "Транспорт", "Учёба", "Подписки", "Проекты", "Прочее"];
}
export function categoryForKind(category: string, kind: "expense" | "income") { return moneyCategories(kind).includes(category) ? category : "Прочее"; }
export function taskScheduleLink(scheduleItemId: string, workspaceId: string | null) { return workspaceId ? null : scheduleItemId || null; }
