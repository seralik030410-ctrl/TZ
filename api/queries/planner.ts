import { and, eq } from "drizzle-orm";
import { currentAccount, currentSettingsId, currentUserId } from "../lib/accountContext";
import { owned } from "../lib/access";
import { OWNER_ID } from "../../db/accounts";
import { getDb } from "./connection";
import {
  journalEntries,
  projects,
  scheduleItems,
  settings,
  stages,
  tasks,
  timeLogs,
  transactions,
} from "@db/schema";

const dayKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export async function ensureSeed() {
  const db = getDb();
  const [existingSettings] = await db.select().from(settings).where(and(eq(settings.id, currentSettingsId()), eq(settings.ownerId, currentUserId()))).limit(1);
  if (!existingSettings) {
    await db.insert(settings).values(owned({ id: currentSettingsId(), theme: "dark", name: currentAccount().name }));
  }
  // A new production account starts empty; sample data is for development.
  if (process.env.NODE_ENV !== "development" || currentUserId() !== OWNER_ID) return;

  const [existingProject] = await db.select().from(projects).where(eq(projects.ownerId, currentUserId())).limit(1);
  if (existingProject) return;

  await db.insert(projects).values([
    {
      id: "project-money",
      name: "Первые клиенты",
      type: "money",
      deadline: dayKey(12),
      priority: 3,
      nextStep: "Отправить три предложения",
      dailyMinutesGoal: 120,
      weeklyMinutesGoal: 600,
      expectedIncome: 9000000,
      actualIncome: 1800000,
    },
    {
      id: "project-game",
      name: "Игра: прототип",
      type: "personal",
      deadline: dayKey(24),
      priority: 2,
      nextStep: "Собрать первую игровую сцену",
      dailyMinutesGoal: 60,
      weeklyMinutesGoal: 360,
    },
    {
      id: "project-study",
      name: "Учёба без долгов",
      type: "study",
      deadline: dayKey(7),
      priority: 2,
      nextStep: "Закрыть домашнюю работу",
      dailyMinutesGoal: 45,
      weeklyMinutesGoal: 240,
    },
  ].map(owned));

  await db.insert(stages).values([
    { id: "stage-clients", projectId: "project-money", name: "Первый пакет клиентов", position: 1, deadline: dayKey(12) },
    { id: "stage-game", projectId: "project-game", name: "Играбельный прототип", position: 1, deadline: dayKey(24) },
  ].map(owned));

  await db.insert(tasks).values([
    {
      id: "task-offer",
      projectId: "project-money",
      stageId: "stage-clients",
      title: "Собрать оффер для клиентов",
      notes: "Один экран: проблема, результат, цена и следующий шаг.",
      due: dayKey(),
      estimateMin: 90,
      importance: 3,
      isMit: true,
      status: "doing",
      position: 1,
    },
    {
      id: "task-leads",
      projectId: "project-money",
      stageId: "stage-clients",
      title: "Написать трём тёплым лидам",
      due: dayKey(1),
      estimateMin: 45,
      importance: 3,
      isMit: true,
      status: "plan",
      position: 2,
    },
    {
      id: "task-homework",
      projectId: "project-study",
      title: "Домашняя работа: раздел 4",
      due: dayKey(),
      estimateMin: 60,
      importance: 2,
      isMit: true,
      status: "plan",
      position: 3,
    },
    {
      id: "task-scene",
      projectId: "project-game",
      stageId: "stage-game",
      title: "Сделать передвижение персонажа",
      due: dayKey(3),
      estimateMin: 120,
      importance: 2,
      status: "plan",
      position: 4,
    },
    {
      id: "task-portfolio",
      projectId: "project-money",
      stageId: "stage-clients",
      title: "Обновить два кейса",
      due: dayKey(-1),
      estimateMin: 60,
      importance: 2,
      status: "plan",
      position: 5,
    },
    {
      id: "task-reading",
      title: "Прочитать 20 страниц",
      due: dayKey(),
      estimateMin: 30,
      importance: 1,
      recurrence: "daily",
      flexibility: "optional",
      status: "done",
      position: 6,
    },
  ].map(owned));

  await db.insert(scheduleItems).values([
    { id: "schedule-class-1", title: "Математический анализ", kind: "class", startMin: 540, endMin: 630, weekdays: "1,3,5", location: "Ауд. 214" },
    { id: "schedule-class-2", title: "Проектный практикум", kind: "class", startMin: 650, endMin: 740, weekdays: "1,3", location: "Ауд. 308" },
    { id: "schedule-lunch", title: "Обед", kind: "lunch", startMin: 760, endMin: 800, weekdays: "1,2,3,4,5,6,7", location: "Кафе рядом" },
    { id: "schedule-work", title: "Постоянная работа", kind: "work", startMin: 1020, endMin: 1200, weekdays: "2,4", location: "Офис" },
  ].map(owned));

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 115 * 60_000);
  const fortyFiveAgo = new Date(now.getTime() - 45 * 60_000);
  await db.insert(timeLogs).values([
    { id: "log-seed-1", projectId: "project-money", taskId: "task-offer", start: twoHoursAgo, end: fortyFiveAgo, minutes: 70, note: "Структура оффера" },
    { id: "log-seed-2", projectId: "project-game", taskId: "task-scene", start: new Date(now.getTime() - 26 * 3_600_000), end: new Date(now.getTime() - 25 * 3_600_000), minutes: 60, note: "Каркас сцены" },
  ].map(owned));

  await db.insert(transactions).values([
    { id: "tx-seed-1", kind: "expense", amount: 42000, category: "Обед", note: "Обед после пар", happenedAt: now },
    { id: "tx-seed-2", kind: "expense", amount: 18000, category: "Транспорт", note: "Метро", happenedAt: new Date(now.getTime() - 3_600_000) },
    { id: "tx-seed-3", kind: "income", amount: 1800000, category: "Проекты", projectId: "project-money", note: "Аванс за лендинг", happenedAt: new Date(now.getTime() - 24 * 3_600_000) },
    { id: "tx-seed-4", kind: "expense", amount: 120000, category: "Учёба", note: "Материалы", happenedAt: new Date(now.getTime() - 30 * 3_600_000) },
  ].map(owned));

  await db.insert(journalEntries).values(owned({
    id: "journal-yesterday",
    date: dayKey(-1),
    mood: 4,
    energy: 3,
    done: "Сделал главное и не разменялся на мелочи.",
    insight: "Два часа спокойной работы дают больше, чем день в многозадачности.",
    gratitude: "За спокойный вечер.",
    tags: "фокус",
  }));
}
