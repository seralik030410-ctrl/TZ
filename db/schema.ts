import {
  boolean,
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

const syncFields = () => ({
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const settings = mysqlTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull().default("Алекс"),
  currency: varchar("currency", { length: 8 }).notNull().default("₽"),
  dailyLimit: int("daily_limit").notNull().default(180000),
  monthlyLimit: int("monthly_limit").notNull().default(4500000),
  workStartMin: int("work_start_min").notNull().default(480),
  workEndMin: int("work_end_min").notNull().default(1320),
  theme: varchar("theme", { length: 16 }).notNull().default("light"),
  autoReflow: boolean("auto_reflow").notNull().default(false),
  cushion: int("cushion").notNull().default(500000),
  timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Dushanbe"),
  agencyEnabled: boolean("agency_enabled").notNull().default(true),
  goldEnabled: boolean("gold_enabled").notNull().default(true),
  debtsEnabled: boolean("debts_enabled").notNull().default(true),
  agencyGoal: int("agency_goal").notNull().default(10000000),
  agencyGoalCurrency: varchar("agency_goal_currency", { length: 8 }).notNull().default("TJS"),
  ...syncFields(),
});

export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("personal"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  deadline: varchar("deadline", { length: 10 }),
  priority: int("priority").notNull().default(2),
  nextStep: text("next_step"),
  dailyMinutesGoal: int("daily_minutes_goal").notNull().default(60),
  weeklyMinutesGoal: int("weekly_minutes_goal").notNull().default(300),
  expectedIncome: int("expected_income").notNull().default(0),
  actualIncome: int("actual_income").notNull().default(0),
  ...syncFields(),
});

export const stages = mysqlTable("stages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  position: int("position").notNull().default(0),
  deadline: varchar("deadline", { length: 10 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  ...syncFields(),
});

export const tasks = mysqlTable("tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }),
  stageId: varchar("stage_id", { length: 36 }),
  title: varchar("title", { length: 240 }).notNull(),
  notes: text("notes"),
  due: varchar("due", { length: 10 }),
  estimateMin: int("estimate_min").notNull().default(30),
  importance: int("importance").notNull().default(2),
  status: varchar("status", { length: 32 }).notNull().default("plan"),
  completedAt: timestamp("completed_at"),
  isMit: boolean("is_mit").notNull().default(false),
  recurrence: varchar("recurrence", { length: 36 }),
  flexibility: varchar("flexibility", { length: 24 }).notNull().default("flexible"),
  dependsOn: varchar("depends_on", { length: 36 }),
  parentId: varchar("parent_id", { length: 36 }),
  plannedStart: timestamp("planned_start"),
  plannedEnd: timestamp("planned_end"),
  position: int("position").notNull().default(0),
  ...syncFields(),
});

export const scheduleItems = mysqlTable("schedule_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  startMin: int("start_min").notNull(),
  endMin: int("end_min").notNull(),
  weekdays: varchar("weekdays", { length: 32 }).notNull().default("1,2,3,4,5"),
  weekParity: varchar("week_parity", { length: 16 }).notNull().default("all"),
  onDate: varchar("on_date", { length: 10 }),
  location: varchar("location", { length: 180 }),
  ...syncFields(),
});

export const scheduleExceptions = mysqlTable("schedule_exceptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  itemId: varchar("item_id", { length: 36 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  action: varchar("action", { length: 24 }).notNull(),
  startMin: int("start_min"),
  endMin: int("end_min"),
  ...syncFields(),
});

export const timeLogs = mysqlTable("time_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 }).notNull(),
  taskId: varchar("task_id", { length: 36 }),
  start: timestamp("start").notNull(),
  end: timestamp("end"),
  minutes: int("minutes").notNull().default(0),
  note: text("note"),
  ...syncFields(),
});

export const transactions = mysqlTable("transactions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  kind: varchar("kind", { length: 16 }).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("RUB"),
  category: varchar("category", { length: 80 }).notNull().default("Прочее"),
  projectId: varchar("project_id", { length: 36 }),
  note: text("note"),
  happenedAt: timestamp("happened_at").notNull().defaultNow(),
  ...syncFields(),
});

export const journalEntries = mysqlTable("journal_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(),
  mood: int("mood").notNull().default(3),
  energy: int("energy").notNull().default(3),
  done: text("done"),
  failed: text("failed"),
  insight: text("insight"),
  gratitude: text("gratitude"),
  text: text("text"),
  tags: varchar("tags", { length: 240 }).notNull().default(""),
  ...syncFields(),
});

export const scheduledBlocks = mysqlTable("scheduled_blocks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 }).notNull(),
  start: timestamp("start").notNull(),
  end: timestamp("end").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("planned"),
  ...syncFields(),
});

export const reflowLog = mysqlTable("reflow_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  reason: varchar("reason", { length: 240 }).notNull(),
  changes: text("changes").notNull(),
  applied: boolean("applied").notNull().default(true),
  ...syncFields(),
});

export const taskTemplates = mysqlTable("task_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 240 }).notNull(),
  estimateMin: int("estimate_min").notNull().default(30),
  weekdays: varchar("weekdays", { length: 32 }),
  startsOn: varchar("starts_on", { length: 10 }).notNull(),
  endsOn: varchar("ends_on", { length: 10 }),
  paused: boolean("paused").notNull().default(false),
  ...syncFields(),
});
export const dayClosures = mysqlTable("day_closures", {
  day: varchar("day", { length: 10 }).primaryKey(),
  note: text("note").notNull(),
  movedIds: text("moved_ids").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export * from "./agency";
export * from "./gold";
export * from "./debts";
