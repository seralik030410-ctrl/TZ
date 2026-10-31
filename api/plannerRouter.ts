import { lockPlanning, assertSharedSlot } from "./sharing";
import { users, workspaces } from "../db/accounts";
import { scheduleForDay } from "../contracts/schedule";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { ensureSeed } from "./queries/planner";
import { materializeRoutines } from "./queries/routines";
import { protectedQuery } from "./accountProcedure";
export { protectedQuery } from "./accountProcedure";
import { authRouter } from "./accountsRouter";
import { visible, privateScope, owned, assertWorkspace } from "./lib/access";
import { currentAccount, currentSettingsId, currentUserId } from "./lib/accountContext";
import { currencyCode, money, timezoneSchema, dayInZone, dayDistance, zonedDateAt, minutesInZone } from "../contracts/shared";
import {
  journalEntries,
  projects,
  reflowLog,
  scheduleItems,
  scheduleExceptions,
  scheduledBlocks,
  settings,
  stages,
  tasks,
  timeLogs,
  transactions,
  recurringBills,
} from "@db/schema";
import {
  allocateTasks,
  dependencyHasCycle,
  taskOrderMatches,
  getFreeWindows,
  reflowDay,
  type MinuteEvent,
} from "@contracts/planning";

const idInput = z.object({ id: z.string().min(1).max(36) });
const agencyCurrencyAliases: Record<string, string> = { "сомони": "TJS", "сом": "TJS", "$": "USD", "доллары": "USD", "₽": "RUB", "рубли": "RUB" };
const active = <T extends { isDeleted: boolean }>(rows: T[]) => rows.filter((row) => !row.isDeleted);
const dateAt = (day: string, minutes: number, timezone = "Asia/Dushanbe") => zonedDateAt(day, minutes, timezone);
const dayKey = (date = new Date(), timezone = "Asia/Dushanbe") => dayInZone(date, timezone);
async function scheduleForDate(day: string): Promise<MinuteEvent[]> {
  const db = getDb();
  const items = active(await db.select().from(scheduleItems).where(visible(scheduleItems)));
  const exceptions = active(await db.select().from(scheduleExceptions).where(visible(scheduleExceptions)));
  return scheduleForDay(items, exceptions, day).map(s => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, fixed: true, flexibility: "fixed" as const }));
}

type PlannerExecutor = Pick<ReturnType<typeof getDb>, "select">;
// UUIDs are global keys: a retry may only reuse a key created by this account.
async function assertRetryOwner(db: PlannerExecutor, table: typeof tasks | typeof transactions | typeof journalEntries | typeof reflowLog | typeof projects | typeof stages | typeof recurringBills, id: string) {
  const [row] = await db.select({ ownerId: table.ownerId }).from(table).where(eq(table.id, id));
  if (row && row.ownerId !== currentUserId()) throw new TRPCError({ code: "NOT_FOUND" });
}
async function requireProject(db: PlannerExecutor, id: string) {
  const [project] = await db.select().from(projects).where(and(visible(projects), eq(projects.id, id), eq(projects.isDeleted, false)));
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Проект не найден" });
  return project;
}
async function taskWorkspace(db: PlannerExecutor, input: { projectId?: string | null; stageId?: string | null; parentId?: string | null; dependsOn?: string | null; workspaceId?: string | null }) {
  let workspaceId = input.workspaceId ?? null;
  const links: { workspaceId: string | null }[] = [];
  if (input.projectId) links.push(await requireProject(db, input.projectId));
  if (input.parentId) {
    const [parent] = await db.select().from(tasks).where(and(visible(tasks), eq(tasks.id, input.parentId), eq(tasks.isDeleted, false)));
    if (!parent || parent.parentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Родительская задача не найдена" });
    links.push(parent);
  }
  if (links.length) {
    const inherited = links[0].workspaceId;
    if (links.some(link => link.workspaceId !== inherited) || (input.workspaceId !== undefined && input.workspaceId !== inherited)) throw new TRPCError({ code: "BAD_REQUEST", message: "Связанные задачи и проект должны быть в одном пространстве" });
    workspaceId = inherited;
  }
  if (input.stageId) {
    const [stage] = await db.select().from(stages).where(and(visible(stages), eq(stages.id, input.stageId), eq(stages.isDeleted, false)));
    if (!stage || stage.projectId !== input.projectId || stage.workspaceId !== workspaceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Этап не принадлежит выбранному проекту" });
  }
  if (input.dependsOn) {
    const [dependency] = await db.select().from(tasks).where(and(visible(tasks), eq(tasks.id, input.dependsOn), eq(tasks.isDeleted, false)));
    if (!dependency || dependency.workspaceId !== workspaceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Зависимые задачи должны быть в одном пространстве" });
  }
  assertWorkspace(workspaceId);
  return workspaceId;
}
async function requireScheduleLink(db: PlannerExecutor, id: string | null | undefined, workspaceId: string | null) {
  if (!id) return;
  if (workspaceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Общие задачи нельзя связывать с личным расписанием" });
  const [event] = await db.select({ id: scheduleItems.id }).from(scheduleItems).where(and(privateScope(scheduleItems), eq(scheduleItems.id, id), eq(scheduleItems.isDeleted, false)));
  if (!event) throw new TRPCError({ code: "BAD_REQUEST", message: "Событие расписания не найдено" });
}

export const plannerRouter = createRouter({
  auth: authRouter,

  bootstrap: protectedQuery.query(async () => {
    await ensureSeed();
    await materializeRoutines();
    const db = getDb();
    const [
      projectRows,
      stageRows,
      taskRows,
      scheduleRows,
      timeRows,
      transactionRows,
      journalRows,
      settingsRows,
      blockRows,
      billRows,
    ] = await Promise.all([
      db.select().from(projects).where(visible(projects)),
      db.select().from(stages).where(visible(stages)),
      db.select().from(tasks).where(visible(tasks)).orderBy(tasks.position),
      db.select().from(scheduleItems).where(visible(scheduleItems)),
      db.select().from(timeLogs).where(visible(timeLogs)).orderBy(desc(timeLogs.start)),
      db.select().from(transactions).where(visible(transactions)).orderBy(desc(transactions.happenedAt)),
      db.select().from(journalEntries).where(visible(journalEntries)).orderBy(desc(journalEntries.date)),
      db.select().from(settings).where(visible(settings)),
      db.select().from(scheduledBlocks).where(visible(scheduledBlocks)),
      db.select().from(recurringBills).where(privateScope(recurringBills)),
    ]);
    const account = currentAccount();
    const spaces = account.workspaceIds.length ? await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, account.workspaceIds)) : [];
    return {
      user: { id: account.id, name: account.name },
      workspaces: spaces,
      busyBlocks: [] as { id: string; start: Date; end: Date }[],
      serverTime: new Date(),
      projects: active(projectRows),
      stages: active(stageRows),
      tasks: active(taskRows),
      schedule: active(scheduleRows),
      scheduleExceptions: active(await db.select().from(scheduleExceptions).where(visible(scheduleExceptions))),
      timeLogs: active(timeRows),
      transactions: active(transactionRows),
      journal: active(journalRows),
      settings: settingsRows[0] ?? null,
      scheduledBlocks: active(blockRows),
      recurringBills: active(billRows),
      activeTimer: active(timeRows).find((log) => log.end === null) ?? null,
    };
  }),

  tasks: createRouter({
    reorder: protectedQuery.input(z.object({ operationId: z.string().uuid(), id: z.string().min(1).max(36), beforeId: z.string().min(1).max(36).nullable(), status: z.enum(["plan", "doing", "done"]), expectedPositions: z.array(z.object({ id: z.string().min(1).max(36), position: z.number().int(), status: z.enum(["plan", "doing", "done"]) })).max(10000).optional() })).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await lockPlanning(tx);
        await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
        await assertRetryOwner(tx, reflowLog, input.operationId);
        const [seen] = await tx.select().from(reflowLog).where(and(visible(reflowLog), eq(reflowLog.id, input.operationId)));
        if (seen) return;
        const rows = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).orderBy(tasks.position, tasks.id);
        if (input.expectedPositions && !taskOrderMatches(input.expectedPositions, rows)) throw new TRPCError({ code: "CONFLICT", message: "Список изменился в другой вкладке. Обновите задачи и повторите перенос." });
        const moved = rows.find(t => t.id === input.id);
        if (!moved) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена" });
        if (input.status === "done" && moved.dependsOn && rows.find(t => t.id === moved.dependsOn)?.status !== "done") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала завершите задачу, от которой зависит эта" });
        if (input.beforeId === input.id) return;
        const next = rows.filter(t => t.id !== input.id);
        const index = input.beforeId ? next.findIndex(t => t.id === input.beforeId) : next.length;
        if (index < 0) throw new TRPCError({ code: "CONFLICT", message: "Список изменился. Обновите задачи." });
        next.splice(index, 0, moved);
        for (let position = 0; position < next.length; position++) {
          const row = next[position];
          if (row.position !== position || row.id === moved.id) await tx.update(tasks).set({ position, ...(row.id === moved.id ? { status: input.status, completedAt: input.status === "done" ? row.completedAt ?? new Date() : null } : {}), updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, row.id)));
        }
        await tx.insert(reflowLog).values(owned({ id: input.operationId, reason: "task-reorder", changes: JSON.stringify({ before: rows.map(r => ({ id: r.id, position: r.position, status: r.status, completedAt: r.completedAt })), after: next.map((r, position) => ({ id: r.id, position, status: r.id === moved.id ? input.status : r.status })) }), applied: true }));
      }); return { ok: true };
    }),
    undoReorder: protectedQuery.input(z.object({ operationId: z.string().uuid() })).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await lockPlanning(tx);
        await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
        const [log] = await tx.select().from(reflowLog).where(and(visible(reflowLog), eq(reflowLog.id, input.operationId))).for("update");
        if (!log || !log.applied || log.reason !== "task-reorder") return;
        const change = JSON.parse(log.changes) as { before: { id: string; position: number; status: string; completedAt: string | null }[]; after: { id: string; position: number; status: string }[] };
        const rows = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).for("update");
        for (const expected of change.after) { const row = rows.find(r => r.id === expected.id); if (!row || row.position !== expected.position || row.status !== expected.status) throw new TRPCError({ code: "CONFLICT", message: "После перемещения список изменился. Отмена недоступна." }); }
        for (const old of change.before) { const after = change.after.find(r => r.id === old.id)!; if (old.position !== after.position || old.status !== after.status) await tx.update(tasks).set({ position: old.position, status: old.status, completedAt: old.completedAt ? new Date(old.completedAt) : null, updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, old.id))); }
        await tx.update(reflowLog).set({ applied: false, updatedAt: new Date() }).where(and(visible(reflowLog), eq(reflowLog.id, log.id)));
      }); return { ok: true };
    }),
    create: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(240),
        notes: z.string().max(4000).optional(),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        estimateMin: z.number().int().min(15).max(1440).default(30),
        importance: z.number().int().min(1).max(3).default(2),
        workspaceId: z.string().uuid().nullable().optional(),
        projectId: z.string().min(1).max(36).nullable().optional(),
        stageId: z.string().min(1).max(36).nullable().optional(),
        dependsOn: z.string().uuid().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
        scheduleItemId: z.string().uuid().nullable().optional(),
        isMit: z.boolean().default(false),
        flexibility: z.enum(["fixed", "flexible", "optional"]).default("flexible"),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        await getDb().transaction(async tx => {
        await lockPlanning(tx);
          await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
          await assertRetryOwner(tx, tasks, id);
          const rows = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).for("update");
          if (rows.some(row => row.id === id)) return;
          const workspaceId = await taskWorkspace(tx, input);
          const scheduleItemId = input.scheduleItemId ?? (input.parentId ? rows.find(row => row.id === input.parentId)?.scheduleItemId : null);
          await requireScheduleLink(tx, scheduleItemId, workspaceId);
          if (input.parentId === id || dependencyHasCycle(rows, id, input.dependsOn ?? null)) throw new TRPCError({ code: "BAD_REQUEST", message: "Связь создаёт цикл" });
          let stageId = input.stageId ?? null;
          if (input.projectId && !stageId) {
            const [firstStage] = await tx.select({ id: stages.id }).from(stages).where(and(visible(stages), eq(stages.projectId, input.projectId), eq(stages.isDeleted, false))).orderBy(stages.position).limit(1);
            stageId = firstStage?.id ?? null;
          }
          await tx.insert(tasks).values(owned({ ...input, stageId, scheduleItemId, workspaceId, id })).onDuplicateKeyUpdate({ set: { id: sql`id` } });
        });
        return { id };
      }),
    update: protectedQuery
      .input(z.object({
        id: z.string().min(1).max(36),
        title: z.string().trim().min(1).max(240).optional(),
        notes: z.string().max(4000).nullable().optional(),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        estimateMin: z.number().int().min(15).max(1440).optional(),
        importance: z.number().int().min(1).max(3).optional(),
        workspaceId: z.string().uuid().nullable().optional(),
        projectId: z.string().min(1).max(36).nullable().optional(),
        stageId: z.string().min(1).max(36).nullable().optional(),
        dependsOn: z.string().uuid().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
        scheduleItemId: z.string().uuid().nullable().optional(),
        status: z.enum(["plan", "doing", "done"]).optional(),
        isMit: z.boolean().optional(),
        flexibility: z.enum(["fixed", "flexible", "optional"]).optional(),
        position: z.number().int().min(0).max(100000).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...values } = input;
        await getDb().transaction(async tx => {
        await lockPlanning(tx);
          await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
          const [row] = await tx.select().from(tasks).where(and(visible(tasks), and(eq(tasks.id, id), eq(tasks.isDeleted, false)))).for("update");
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена" });
          const rows = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).for("update");
          const workspaceId = await taskWorkspace(tx, { ...row, ...values, workspaceId: values.workspaceId !== undefined ? values.workspaceId : (values.projectId !== undefined || values.parentId !== undefined ? undefined : row.workspaceId) });
          if (workspaceId !== row.workspaceId && row.ownerId !== currentUserId()) throw new TRPCError({ code: "FORBIDDEN", message: "Только автор может менять пространство задачи" });
          if (workspaceId !== row.workspaceId && rows.some(task => task.parentId === id || task.dependsOn === id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Сначала измените связанные задачи" });
          values.workspaceId = workspaceId;
          if (values.scheduleItemId !== undefined || workspaceId !== row.workspaceId) await requireScheduleLink(tx, values.scheduleItemId ?? row.scheduleItemId, workspaceId);
          const dependencyId = values.dependsOn === undefined ? row.dependsOn : values.dependsOn;
          const dependency = dependencyId ? rows.find(task => task.id === dependencyId) : undefined;
          if (dependencyId && !dependency) throw new TRPCError({ code: "BAD_REQUEST", message: "Зависимая задача не найдена" });
          if (dependencyHasCycle(rows, id, dependencyId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Такая зависимость создаст цикл" });
          const parentId = values.parentId === undefined ? row.parentId : values.parentId;
          const parent = parentId ? rows.find(task => task.id === parentId) : undefined;
          if (parentId && (parentId === id || !parent || parent.parentId || rows.some(task => task.parentId === id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Подзадачи могут быть только одного уровня" });
          if (row.parentId && values.status && values.status !== "done" && rows.find(task => task.id === row.parentId)?.status === "done") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала верните родительскую задачу в работу" });
          if ((values.status ?? row.status) === "done" && dependencyId && dependency?.status !== "done") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала завершите задачу, от которой зависит эта" });
          if ((values.status ?? row.status) === "done" && rows.some(task => task.parentId === id && task.status !== "done")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала завершите подзадачи" });
          if (row.status === "done" && values.status && values.status !== "done" && rows.some(task => task.dependsOn === id && task.status === "done")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала верните в работу завершённые задачи, которые зависят от этой" });
          await tx.update(scheduledBlocks).set({ workspaceId, updatedAt: new Date() }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.taskId, id)));
          await tx.update(tasks).set({ ...values, ...(values.status ? { completedAt: values.status === "done" ? row.completedAt ?? new Date() : null } : {}), updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, id)));
          if (workspaceId && workspaceId !== row.workspaceId) {
            const blocks = await tx.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.taskId, id), eq(scheduledBlocks.isDeleted, false)));
            for (const block of blocks) await assertSharedSlot(tx, [id], block.start, block.end, blocks.map(item => item.id));
            if (row.plannedStart && row.plannedEnd) await assertSharedSlot(tx, [id], row.plannedStart, row.plannedEnd, blocks.map(item => item.id));
          }
        });
        return { ok: true };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await lockPlanning(tx);
        await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
        const rows = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).for("update");
        if (rows.some(task => task.dependsOn === input.id)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала уберите зависимость в связанных задачах" });
        if (rows.some(task => task.parentId === input.id)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала архивируйте подзадачи" });
        await tx.update(tasks).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, input.id)));
      });
      return { ok: true };
    }),
  }),

  projects: createRouter({
    create: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(160),
        workspaceId: z.string().uuid().nullable().optional(),
        type: z.enum(["money", "study", "personal", "agency"]).default("personal"),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dailyMinutesGoal: z.number().int().min(0).max(1440).default(60),
        weeklyMinutesGoal: z.number().int().min(0).max(10080).default(300),
        expectedIncome: z.number().int().min(0).default(0),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        assertWorkspace(input.workspaceId);
        await getDb().transaction(async tx => {
          await lockPlanning(tx);
          await assertRetryOwner(tx, projects, id);
          const [existing] = await tx.select({ id: projects.id }).from(projects).where(and(visible(projects), eq(projects.id, id)));
          if (existing) return;
          await tx.insert(projects).values(owned({ ...input, id }));
          await tx.insert(stages).values(owned({ id: crypto.randomUUID(), projectId: id, workspaceId: input.workspaceId, name: "Первый этап", position: 1, deadline: input.deadline }));
        });
        return { id };
      }),
    update: protectedQuery
      .input(z.object({
        id: z.string().min(1).max(36),
        name: z.string().trim().min(1).max(160).optional(),
        status: z.enum(["active", "paused", "done"]).optional(),
        nextStep: z.string().max(2000).nullable().optional(),
        dailyMinutesGoal: z.number().int().min(0).max(1440).optional(),
        weeklyMinutesGoal: z.number().int().min(0).max(10080).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...values } = input;
        await getDb().update(projects).set({ ...values, updatedAt: new Date() }).where(and(visible(projects), eq(projects.id, id)));
        return { ok: true };
      }),
  }),

  timer: createRouter({
    start: protectedQuery
      .input(z.object({ projectId: z.string().min(1).max(36), taskId: z.string().min(1).max(36).nullable().optional(), note: z.string().max(500).optional() }))
      .mutation(async ({ input }) => {
        const db = getDb();
        await requireProject(db, input.projectId);
        if (input.taskId) {
          const [task] = await db.select().from(tasks).where(and(visible(tasks), eq(tasks.id, input.taskId), eq(tasks.isDeleted, false)));
          if (!task || task.projectId !== input.projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Задача не принадлежит проекту" });
        }
        const [running] = await db.select().from(timeLogs).where(and(visible(timeLogs), and(isNull(timeLogs.end), eq(timeLogs.isDeleted, false)))).limit(1);
        if (running) throw new TRPCError({ code: "CONFLICT", message: "Сначала остановите текущий таймер" });
        const id = crypto.randomUUID();
        await db.insert(timeLogs).values(owned({ id, projectId: input.projectId, taskId: input.taskId, note: input.note, start: new Date(), minutes: 0 }));
        return { id };
      }),
    stop: protectedQuery.mutation(async () => {
      const db = getDb();
      const [running] = await db.select().from(timeLogs).where(and(visible(timeLogs), and(isNull(timeLogs.end), eq(timeLogs.isDeleted, false)))).orderBy(desc(timeLogs.start)).limit(1);
      if (!running) return { ok: false, minutes: 0 };
      const end = new Date();
      const minutes = Math.max(1, Math.round((end.getTime() - running.start.getTime()) / 60_000));
      await db.update(timeLogs).set({ end, minutes, updatedAt: new Date() }).where(and(visible(timeLogs), eq(timeLogs.id, running.id)));
      return { ok: true, minutes };
    }),
  }),

  money: createRouter({
    add: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        kind: z.enum(["expense", "income"]),
        amount: z.number().int().positive().max(100_000_000),
        currency: currencyCode.default("TJS"),
        happenedAt: z.date().optional(),
        category: z.string().trim().min(1).max(80),
        note: z.string().max(1000).optional(),
        projectId: z.string().min(1).max(36).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        await assertRetryOwner(getDb(), transactions, id);
        if (input.projectId) await requireProject(getDb(), input.projectId);
        await getDb().insert(transactions).values(owned({ ...input, id, happenedAt: input.happenedAt ?? new Date() })).onDuplicateKeyUpdate({ set: { id: sql`id` } });
        return { id };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().update(transactions).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(transactions), eq(transactions.id, input.id)));
      return { ok: true };
    }),
  }),

  bills: createRouter({
    create: protectedQuery.input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), amount: money.positive(), currency: currencyCode.default("TJS"), dueDay: z.number().int().min(1).max(31), category: z.string().trim().min(1).max(80).default("Обязательные платежи") })).mutation(async ({ input }) => {
      await assertRetryOwner(getDb(), recurringBills, input.id);
      await getDb().insert(recurringBills).values(owned(input)).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      return { id: input.id };
    }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().update(recurringBills).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(recurringBills), eq(recurringBills.id, input.id)));
      return { ok: true };
    }),
    markPaid: protectedQuery.input(idInput).mutation(async ({ input }) => getDb().transaction(async tx => {
      await lockPlanning(tx);
      const [bill] = await tx.select().from(recurringBills).where(and(privateScope(recurringBills), eq(recurringBills.id, input.id), eq(recurringBills.isDeleted, false))).for("update");
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Платёж не найден" });
      const [prefs] = await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId())));
      const month = dayInZone(new Date(), prefs?.timezone).slice(0, 7);
      if (bill.paidThrough === month) return { ok: true, alreadyPaid: true };
      await tx.insert(transactions).values(owned({ id: crypto.randomUUID(), kind: "expense", amount: bill.amount, currency: bill.currency, category: bill.category, note: bill.name, happenedAt: new Date() }));
      await tx.update(recurringBills).set({ paidThrough: month, updatedAt: new Date() }).where(and(privateScope(recurringBills), eq(recurringBills.id, bill.id)));
      return { ok: true, alreadyPaid: false };
    })),
  }),

  stages: createRouter({
    create: protectedQuery.input(z.object({ id: z.string().uuid().optional(), projectId: z.string().uuid(), name: z.string().trim().min(1).max(160), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() })).mutation(async ({ input }) => {
      const project = await requireProject(getDb(), input.projectId);
      const id = input.id ?? crypto.randomUUID();
      await assertRetryOwner(getDb(), stages, id);
      const existing = await getDb().select({ id: stages.id }).from(stages).where(and(visible(stages), eq(stages.id, id)));
      if (existing.length) return { id };
      const rows = await getDb().select().from(stages).where(and(visible(stages), eq(stages.projectId, project.id), eq(stages.isDeleted, false)));
      await getDb().insert(stages).values(owned({ id, projectId: project.id, workspaceId: project.workspaceId, name: input.name, deadline: input.deadline ?? project.deadline ?? null, position: rows.length + 1 }));
      return { id };
    }),
    rename: protectedQuery.input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(160) })).mutation(async ({ input }) => {
      const [stage] = await getDb().select().from(stages).where(and(visible(stages), eq(stages.id, input.id), eq(stages.isDeleted, false)));
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Этап не найден" });
      await getDb().update(stages).set({ name: input.name, updatedAt: new Date() }).where(and(visible(stages), eq(stages.id, input.id)));
      return { ok: true };
    }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      const [stage] = await getDb().select().from(stages).where(and(visible(stages), eq(stages.id, input.id), eq(stages.isDeleted, false)));
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Этап не найден" });
      const [tasksInStage] = await getDb().select({ id: tasks.id }).from(tasks).where(and(visible(tasks), eq(tasks.stageId, stage.id), eq(tasks.isDeleted, false))).limit(1);
      if (tasksInStage) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала переместите задачи этого этапа" });
      await getDb().update(stages).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(stages), eq(stages.id, stage.id)));
      return { ok: true };
    }),
  }),

  journal: createRouter({
    save: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        operationId: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        mood: z.number().int().min(1).max(5).default(3),
        energy: z.number().int().min(1).max(5).default(3),
        done: z.string().max(5000).optional(),
        failed: z.string().max(5000).optional(),
        insight: z.string().max(5000).optional(),
        gratitude: z.string().max(5000).optional(),
        text: z.string().max(10000).optional(),
        tags: z.string().max(240).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = getDb();
        if (input.id) await assertRetryOwner(db, journalEntries, input.id);
        if (input.operationId) return db.transaction(async tx => {
          await lockPlanning(tx);
          await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))).for("update");
          await assertRetryOwner(tx, reflowLog, input.operationId!);
          const [seen] = await tx.select().from(reflowLog).where(and(visible(reflowLog), eq(reflowLog.id, input.operationId!)));
          if (seen) return { id: input.id ?? input.operationId! };
          const { operationId, id: proposedId, ...values } = input;
          const [previous] = await tx.select().from(journalEntries).where(and(visible(journalEntries), eq(journalEntries.date, values.date))).limit(1);
          const id = previous?.id ?? proposedId ?? crypto.randomUUID();
          if (previous) await tx.update(journalEntries).set({ ...values, isDeleted: false, updatedAt: new Date() }).where(and(visible(journalEntries), eq(journalEntries.id, id)));
          else await tx.insert(journalEntries).values(owned({ ...values, id }));
          await tx.insert(reflowLog).values(owned({ id: operationId!, reason: "journal-save", changes: JSON.stringify({ journalId: id }), applied: true }));
          return { id };
        });
        const [existing] = await db.select().from(journalEntries).where(and(visible(journalEntries), eq(journalEntries.date, input.date))).limit(1);
        if (existing) {
          const values = { ...input };
          delete values.id;
          delete values.operationId;
          await db.update(journalEntries).set({ ...values, updatedAt: new Date() }).where(and(visible(journalEntries), eq(journalEntries.id, existing.id)));
          return { id: existing.id };
        }
        const id = crypto.randomUUID();
        await db.insert(journalEntries).values(owned({ ...input, id }));
        return { id };
      }),
  }),

  schedule: createRouter({
    add: protectedQuery
      .input(z.object({
        title: z.string().trim().min(1).max(180),
        kind: z.enum(["class", "lunch", "work"]),
        startMin: z.number().int().min(0).max(1439),
        endMin: z.number().int().min(1).max(1440),
        weekdays: z.string().regex(/^(\d,)*\d$/),
        location: z.string().max(180).optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.endMin <= input.startMin) throw new TRPCError({ code: "BAD_REQUEST", message: "Конец должен быть позже начала" });
        const id = crypto.randomUUID();
        await getDb().insert(scheduleItems).values(owned({ ...input, id }));
        return { id };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().update(scheduleItems).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(scheduleItems), eq(scheduleItems.id, input.id)));
      return { ok: true };
    }),
  }),

  settings: createRouter({
    update: protectedQuery
      .input(z.object({
        name: z.string().trim().min(1).max(80).optional(),
        currency: z.string().trim().min(1).max(8).optional(),
        dailyLimit: z.number().int().min(0).optional(),
        monthlyLimit: z.number().int().min(0).optional(),
        workStartMin: z.number().int().min(0).max(1439).optional(),
        workEndMin: z.number().int().min(1).max(1440).optional(),
        cushion: z.number().int().min(0).optional(),
        autoReflow: z.boolean().optional(),
        theme: z.enum(["light", "dark"]).optional(),
        timezone: timezoneSchema.optional(),
        agencyEnabled: z.boolean().optional(),
        goldEnabled: z.boolean().optional(),
        debtsEnabled: z.boolean().optional(),
        agencyGoal: money.optional(),
        agencyGoalCurrency: z.preprocess(value => agencyCurrencyAliases[String(value).toLowerCase()] ?? value, currencyCode).optional(),
        monthlySavings: money.optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.name) await getDb().update(users).set({ name: input.name }).where(eq(users.id, currentUserId()));
        await getDb().update(settings).set({ ...input, updatedAt: new Date() }).where(and(visible(settings), eq(settings.id, currentSettingsId())));
        return { ok: true };
      }),
  }),

  planning: createRouter({
    freeWindows: protectedQuery
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        const db = getDb();
        const [settingsRow] = await db.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId())));
        const fixed = await scheduleForDate(input.date);
        return getFreeWindows(
          settingsRow?.workStartMin ?? 480,
          settingsRow?.workEndMin ?? 1320,
          fixed,
        );
      }),
    autoPlan: protectedQuery
      .input(z.object({ stageId: z.string().min(1).max(36), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(14).default(7) }))
      .mutation(async ({ input }) => {
        return getDb().transaction(async db => {
        await lockPlanning(db);
        const [stage] = await db.select().from(stages).where(and(visible(stages), eq(stages.id, input.stageId), eq(stages.isDeleted, false)));
        if (!stage) throw new TRPCError({ code: "NOT_FOUND" });
        const project = await requireProject(db, stage.projectId);
        const plannedRows = await db.select({ taskId: scheduledBlocks.taskId }).from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.isDeleted, false), eq(scheduledBlocks.status, "planned")));
        const plannedTaskIds = new Set(plannedRows.map(row => row.taskId));
        const stageTasks = (await db.select().from(tasks).where(visible(tasks))).filter(
          (task) => !task.isDeleted && (task.stageId === input.stageId || (!task.stageId && task.projectId === stage.projectId)) && task.status !== "done" && !plannedTaskIds.has(task.id),
        );
        const windowsByDay: Record<string, { startMin: number; endMin: number }[]> = {};
        const [settingsRow] = await db.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId())));
        for (let offset = 0; offset < input.days; offset += 1) {
          const date = new Date(`${input.startDate}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + offset);
          const day = date.toISOString().slice(0, 10);
          windowsByDay[day] = getFreeWindows(
            settingsRow?.workStartMin ?? 480,
            settingsRow?.workEndMin ?? 1320,
            await scheduleForDate(day),
          );
        }
        const allocations = allocateTasks(
          stageTasks.map((task) => ({ id: task.id, estimateMin: task.estimateMin, priority: task.importance, dependsOn: task.dependsOn })),
          windowsByDay,
          1,
          project?.dailyMinutesGoal ?? 120,
        );
        for (const allocation of allocations) {
          const start = dateAt(allocation.day, allocation.startMin, settingsRow?.timezone);
          const end = dateAt(allocation.day, allocation.endMin, settingsRow?.timezone);
          await assertSharedSlot(db, [allocation.taskId], start, end);
          await db.insert(scheduledBlocks).values(owned({ id: crypto.randomUUID(), taskId: allocation.taskId, workspaceId: stageTasks.find(task => task.id === allocation.taskId)?.workspaceId, start, end }));
          await db.update(tasks).set({ plannedStart: start, plannedEnd: end, updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, allocation.taskId)));
        }
        for (const task of stageTasks) if (!task.stageId && allocations.some(a => a.taskId === task.id)) await db.update(tasks).set({ stageId: input.stageId, updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, task.id)));
        return { count: allocations.length, allocations };
        });
      }),
    scheduleTask: protectedQuery.input(z.object({ taskId: z.string().uuid(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(async ({ input }) => getDb().transaction(async tx => {
      await lockPlanning(tx);
      const [task] = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.id, input.taskId), eq(tasks.isDeleted, false))).for("update");
      if (!task || task.status === "done") throw new TRPCError({ code: "NOT_FOUND", message: "Открытая задача не найдена" });
      if (dayDistance(input.startDate, input.endDate) < 0 || dayDistance(input.startDate, input.endDate) > 30 || input.endDate > (task.due ?? input.endDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите период до срока задачи длиной не более 31 дня" });
      if (input.startDate < dayKey(new Date(), (await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId()))))[0]?.timezone)) throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя планировать на прошедшую дату" });
      const existing = await tx.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.taskId, task.id), eq(scheduledBlocks.isDeleted, false)));
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "У задачи уже есть блоки в расписании" });
      const [prefs] = await tx.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId())));
      const timezone = prefs?.timezone ?? "Asia/Dushanbe";
      const windowsByDay: Record<string, { startMin: number; endMin: number }[]> = {};
      const today = dayKey(new Date(), timezone);
      for (let offset = 0; ; offset++) {
        const date = new Date(`${input.startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
        const day = date.toISOString().slice(0, 10); if (day > input.endDate) break;
        const blocks = await tx.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.isDeleted, false)));
        const events = await scheduleForDate(day);
        for (const block of blocks) if (dayKey(block.start, timezone) === day && block.status === "planned") events.push({ id: block.id, startMin: minutesInZone(block.start, timezone), endMin: minutesInZone(block.end, timezone), fixed: true });
        const startMin = day === today ? Math.max(prefs?.workStartMin ?? 480, Math.ceil((minutesInZone(new Date(), timezone) + 1) / 30) * 30) : prefs?.workStartMin ?? 480;
        windowsByDay[day] = getFreeWindows(startMin, prefs?.workEndMin ?? 1320, events);
      }
      const allocations = allocateTasks([{ id: task.id, estimateMin: task.estimateMin, priority: task.importance }], windowsByDay, 1);
      if (!allocations.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "До срока не нашлось свободного окна. Расширьте период или измените расписание." });
      for (const allocation of allocations) {
        const start = dateAt(allocation.day, allocation.startMin, timezone); const end = dateAt(allocation.day, allocation.endMin, timezone);
        await assertSharedSlot(tx, [task.id], start, end);
        await tx.insert(scheduledBlocks).values(owned({ id: crypto.randomUUID(), taskId: task.id, workspaceId: task.workspaceId, start, end }));
      }
      const minutes = allocations.reduce((sum, block) => sum + block.endMin - block.startMin, 0);
      return { count: allocations.length, minutes, remainingMin: Math.max(0, task.estimateMin - minutes) };
    })),
    reflow: protectedQuery.mutation(async () => {
      return getDb().transaction(async db => {
      await lockPlanning(db);
      const [settingsRow] = await db.select().from(settings).where(and(visible(settings), eq(settings.id, currentSettingsId())));
      const today = dayKey(new Date(), settingsRow?.timezone);
      const fixed = await scheduleForDate(today);
      const blocks = active(await db.select().from(scheduledBlocks).where(visible(scheduledBlocks))).filter((block) => dayKey(block.start, settingsRow?.timezone) === today && block.status === "planned");
      const blockTasks = active(await db.select().from(tasks).where(visible(tasks)));
      const events: MinuteEvent[] = [
        ...fixed,
        ...blocks.map((block) => ({
          id: block.id,
          startMin: minutesInZone(block.start, settingsRow?.timezone),
          endMin: minutesInZone(block.end, settingsRow?.timezone),
          flexibility: (blockTasks.find((task) => task.id === block.taskId)?.flexibility ?? "flexible") as "fixed" | "flexible" | "optional",
          priority: blockTasks.find((task) => task.id === block.taskId)?.importance ?? 1,
        })),
      ];
      const now = new Date();
      const result = reflowDay(events, minutesInZone(now, settingsRow?.timezone), settingsRow?.workEndMin ?? 1320);
      const changed: unknown[] = [];
      for (const placement of result.placements) {
        const block = blocks.find((item) => item.id === placement.id);
        if (!block) continue;
        const start = dateAt(today, placement.startMin, settingsRow?.timezone);
        const end = dateAt(today, placement.endMin, settingsRow?.timezone);
        if (start.getTime() !== block.start.getTime() || end.getTime() !== block.end.getTime()) {
          await assertSharedSlot(db, [block.taskId], start, end, [block.id]);
          await db.update(scheduledBlocks).set({ start, end, status: "moved", updatedAt: new Date() }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, block.id)));
          changed.push({ id: block.id, start, end });
        }
      }
      for (const id of result.removed) {
        await db.update(scheduledBlocks).set({ status: "moved", isDeleted: true, updatedAt: new Date() }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id)));
      }
      await db.insert(reflowLog).values(owned({ id: crypto.randomUUID(), reason: "Пересборка оставшегося дня", changes: JSON.stringify({ changed, removed: result.removed }) }));
      return { moved: changed.length, removed: result.removed.length };
      });
    }),
  }),

  exportData: protectedQuery.query(async () => {
    const db = getDb();
    return {
      exportedAt: new Date(),
      projects: active(await db.select().from(projects).where(and(visible(projects), ne(projects.isDeleted, true)))),
      tasks: active(await db.select().from(tasks).where(and(visible(tasks), ne(tasks.isDeleted, true)))),
      transactions: active(await db.select().from(transactions).where(and(visible(transactions), ne(transactions.isDeleted, true)))),
      journal: active(await db.select().from(journalEntries).where(and(visible(journalEntries), ne(journalEntries.isDeleted, true)))),
      recurringBills: active(await db.select().from(recurringBills).where(and(privateScope(recurringBills), ne(recurringBills.isDeleted, true)))),
    };
  }),
});
