import { scheduleForDay } from "../contracts/schedule";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { ensureSeed } from "./queries/planner";
import { materializeRoutines } from "./queries/routines";
import { env } from "./lib/env";
import { currencyCode, money, timezoneSchema, dayInZone, zonedDateAt, minutesInZone } from "../contracts/shared";
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
} from "@db/schema";
import {
  allocateTasks,
  dependencyHasCycle,
  taskOrderMatches,
  getFreeWindows,
  reflowDay,
  type MinuteEvent,
} from "@contracts/planning";

const COOKIE_NAME = "planner_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function signature(timestamp: string) {
  return createHmac("sha256", env.appSecret || "planner-development-secret")
    .update(timestamp)
    .digest("hex");
}

function hasSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];
  if (!token) return false;
  const [timestamp, provided] = token.split(".");
  if (!timestamp || !provided) return false;
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(provided)) return false;
  const age = Date.now() / 1000 - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_AGE_SECONDS) return false;
  const expected = signature(timestamp);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export const protectedQuery = publicQuery.use(({ ctx, next }) => {
  if (!hasSession(ctx.req)) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next();
});

const idInput = z.object({ id: z.string().min(1).max(36) });
const active = <T extends { isDeleted: boolean }>(rows: T[]) => rows.filter((row) => !row.isDeleted);
const dateAt = (day: string, minutes: number, timezone = "Asia/Dushanbe") => zonedDateAt(day, minutes, timezone);
const dayKey = (date = new Date(), timezone = "Asia/Dushanbe") => dayInZone(date, timezone);
async function scheduleForDate(day: string): Promise<MinuteEvent[]> {
  const db = getDb();
  const items = active(await db.select().from(scheduleItems));
  const exceptions = active(await db.select().from(scheduleExceptions));
  return scheduleForDay(items, exceptions, day).map(s => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, fixed: true, flexibility: "fixed" as const }));
}

export const plannerRouter = createRouter({
  auth: createRouter({
    status: publicQuery.query(({ ctx }) => ({ authenticated: hasSession(ctx.req) })),
    login: publicQuery
      .input(z.object({ password: z.string().min(1).max(200) }))
      .mutation(({ ctx, input }) => {
        const ip = ctx.req.headers.get("x-forwarded-for") ?? "local";
        const attempt = loginAttempts.get(ip);
        if (attempt && attempt.resetAt > Date.now() && attempt.count >= 8) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Слишком много попыток. Подождите минуту." });
        }
        const expectedPassword = env.plannerPassword || "ritm2026";
        if (input.password !== expectedPassword) {
          loginAttempts.set(ip, {
            count: (attempt?.resetAt && attempt.resetAt > Date.now() ? attempt.count : 0) + 1,
            resetAt: Date.now() + 60_000,
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
        }
        loginAttempts.delete(ip);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const token = `${timestamp}.${signature(timestamp)}`;
        ctx.resHeaders.append(
          "Set-Cookie",
          `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}${env.isProduction ? "; Secure" : ""}`,
        );
        return { ok: true };
      }),
    logout: publicQuery.mutation(({ ctx }) => {
      ctx.resHeaders.append(
        "Set-Cookie",
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
      return { ok: true };
    }),
  }),

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
    ] = await Promise.all([
      db.select().from(projects),
      db.select().from(stages),
      db.select().from(tasks).orderBy(tasks.position),
      db.select().from(scheduleItems),
      db.select().from(timeLogs).orderBy(desc(timeLogs.start)),
      db.select().from(transactions).orderBy(desc(transactions.happenedAt)),
      db.select().from(journalEntries).orderBy(desc(journalEntries.date)),
      db.select().from(settings),
      db.select().from(scheduledBlocks),
    ]);
    return {
      serverTime: new Date(),
      projects: active(projectRows),
      stages: active(stageRows),
      tasks: active(taskRows),
      schedule: active(scheduleRows),
      scheduleExceptions: active(await db.select().from(scheduleExceptions)),
      timeLogs: active(timeRows),
      transactions: active(transactionRows),
      journal: active(journalRows),
      settings: settingsRows[0] ?? null,
      scheduledBlocks: active(blockRows),
      activeTimer: active(timeRows).find((log) => log.end === null) ?? null,
    };
  }),

  tasks: createRouter({
    reorder: protectedQuery.input(z.object({ operationId: z.string().uuid(), id: z.string().min(1).max(36), beforeId: z.string().min(1).max(36).nullable(), status: z.enum(["plan", "doing", "done"]), expectedPositions: z.array(z.object({ id: z.string().min(1).max(36), position: z.number().int(), status: z.enum(["plan", "doing", "done"]) })).max(10000).optional() })).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
        const [seen] = await tx.select().from(reflowLog).where(eq(reflowLog.id, input.operationId));
        if (seen) return;
        const rows = await tx.select().from(tasks).where(eq(tasks.isDeleted, false)).orderBy(tasks.position, tasks.id);
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
          if (row.position !== position || row.id === moved.id) await tx.update(tasks).set({ position, ...(row.id === moved.id ? { status: input.status, completedAt: input.status === "done" ? row.completedAt ?? new Date() : null } : {}), updatedAt: new Date() }).where(eq(tasks.id, row.id));
        }
        await tx.insert(reflowLog).values({ id: input.operationId, reason: "task-reorder", changes: JSON.stringify({ before: rows.map(r => ({ id: r.id, position: r.position, status: r.status, completedAt: r.completedAt })), after: next.map((r, position) => ({ id: r.id, position, status: r.id === moved.id ? input.status : r.status })) }), applied: true });
      }); return { ok: true };
    }),
    undoReorder: protectedQuery.input(z.object({ operationId: z.string().uuid() })).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
        const [log] = await tx.select().from(reflowLog).where(eq(reflowLog.id, input.operationId)).for("update");
        if (!log || !log.applied || log.reason !== "task-reorder") return;
        const change = JSON.parse(log.changes) as { before: { id: string; position: number; status: string; completedAt: string | null }[]; after: { id: string; position: number; status: string }[] };
        const rows = await tx.select().from(tasks).where(eq(tasks.isDeleted, false)).for("update");
        for (const expected of change.after) { const row = rows.find(r => r.id === expected.id); if (!row || row.position !== expected.position || row.status !== expected.status) throw new TRPCError({ code: "CONFLICT", message: "После перемещения список изменился. Отмена недоступна." }); }
        for (const old of change.before) { const after = change.after.find(r => r.id === old.id)!; if (old.position !== after.position || old.status !== after.status) await tx.update(tasks).set({ position: old.position, status: old.status, completedAt: old.completedAt ? new Date(old.completedAt) : null, updatedAt: new Date() }).where(eq(tasks.id, old.id)); }
        await tx.update(reflowLog).set({ applied: false, updatedAt: new Date() }).where(eq(reflowLog.id, log.id));
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
        projectId: z.string().min(1).max(36).nullable().optional(),
        stageId: z.string().min(1).max(36).nullable().optional(),
        dependsOn: z.string().uuid().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
        isMit: z.boolean().default(false),
        flexibility: z.enum(["fixed", "flexible", "optional"]).default("flexible"),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        if (input.dependsOn || input.parentId) {
          await getDb().transaction(async tx => {
            await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
            const rows = await tx.select().from(tasks).where(eq(tasks.isDeleted, false)).for("update");
            if (rows.some(row => row.id === id)) return;
            if (input.parentId) {
              const parent = rows.find(row => row.id === input.parentId);
              if (!parent || parent.parentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите существующую задачу верхнего уровня" });
              if (input.parentId === id) throw new TRPCError({ code: "BAD_REQUEST", message: "Задача не может быть своей подзадачей" });
            }
            const dependency = rows.find(row => row.id === input.dependsOn);
            if (input.dependsOn && !dependency) throw new TRPCError({ code: "BAD_REQUEST", message: "Зависимая задача не найдена" });
            if (dependencyHasCycle(rows, id, input.dependsOn ?? null)) throw new TRPCError({ code: "BAD_REQUEST", message: "Такая зависимость создаст цикл" });
            await tx.insert(tasks).values({ ...input, id }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
          });
        } else await getDb().insert(tasks).values({ ...input, id }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
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
        projectId: z.string().min(1).max(36).nullable().optional(),
        stageId: z.string().min(1).max(36).nullable().optional(),
        dependsOn: z.string().uuid().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
        status: z.enum(["plan", "doing", "done"]).optional(),
        isMit: z.boolean().optional(),
        flexibility: z.enum(["fixed", "flexible", "optional"]).optional(),
        position: z.number().int().min(0).max(100000).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...values } = input;
        await getDb().transaction(async tx => {
          await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
          const [row] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.isDeleted, false))).for("update");
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена" });
          const rows = await tx.select().from(tasks).where(eq(tasks.isDeleted, false)).for("update");
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
          await tx.update(tasks).set({ ...values, ...(values.status ? { completedAt: values.status === "done" ? row.completedAt ?? new Date() : null } : {}), updatedAt: new Date() }).where(eq(tasks.id, id));
        });
        return { ok: true };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().transaction(async tx => {
        await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
        const rows = await tx.select().from(tasks).where(eq(tasks.isDeleted, false)).for("update");
        if (rows.some(task => task.dependsOn === input.id)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала уберите зависимость в связанных задачах" });
        if (rows.some(task => task.parentId === input.id)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала архивируйте подзадачи" });
        await tx.update(tasks).set({ isDeleted: true, updatedAt: new Date() }).where(eq(tasks.id, input.id));
      });
      return { ok: true };
    }),
  }),

  projects: createRouter({
    create: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(160),
        type: z.enum(["money", "study", "personal", "agency"]).default("personal"),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dailyMinutesGoal: z.number().int().min(0).max(1440).default(60),
        weeklyMinutesGoal: z.number().int().min(0).max(10080).default(300),
        expectedIncome: z.number().int().min(0).default(0),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        await getDb().insert(projects).values({ ...input, id });
        await getDb().insert(stages).values({ id: crypto.randomUUID(), projectId: id, name: "Первый этап", position: 1, deadline: input.deadline });
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
        await getDb().update(projects).set({ ...values, updatedAt: new Date() }).where(eq(projects.id, id));
        return { ok: true };
      }),
  }),

  timer: createRouter({
    start: protectedQuery
      .input(z.object({ projectId: z.string().min(1).max(36), taskId: z.string().min(1).max(36).nullable().optional(), note: z.string().max(500).optional() }))
      .mutation(async ({ input }) => {
        const db = getDb();
        const [running] = await db.select().from(timeLogs).where(and(isNull(timeLogs.end), eq(timeLogs.isDeleted, false))).limit(1);
        if (running) throw new TRPCError({ code: "CONFLICT", message: "Сначала остановите текущий таймер" });
        const id = crypto.randomUUID();
        await db.insert(timeLogs).values({ id, projectId: input.projectId, taskId: input.taskId, note: input.note, start: new Date(), minutes: 0 });
        return { id };
      }),
    stop: protectedQuery.mutation(async () => {
      const db = getDb();
      const [running] = await db.select().from(timeLogs).where(and(isNull(timeLogs.end), eq(timeLogs.isDeleted, false))).orderBy(desc(timeLogs.start)).limit(1);
      if (!running) return { ok: false, minutes: 0 };
      const end = new Date();
      const minutes = Math.max(1, Math.round((end.getTime() - running.start.getTime()) / 60_000));
      await db.update(timeLogs).set({ end, minutes, updatedAt: new Date() }).where(eq(timeLogs.id, running.id));
      return { ok: true, minutes };
    }),
  }),

  money: createRouter({
    add: protectedQuery
      .input(z.object({
        id: z.string().uuid().optional(),
        kind: z.enum(["expense", "income"]),
        amount: z.number().int().positive().max(100_000_000),
        currency: currencyCode.default("RUB"),
        happenedAt: z.date().optional(),
        category: z.string().trim().min(1).max(80),
        note: z.string().max(1000).optional(),
        projectId: z.string().min(1).max(36).nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = input.id ?? crypto.randomUUID();
        await getDb().insert(transactions).values({ ...input, id, happenedAt: input.happenedAt ?? new Date() }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
        return { id };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().update(transactions).set({ isDeleted: true, updatedAt: new Date() }).where(eq(transactions.id, input.id));
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
        if (input.operationId) return db.transaction(async tx => {
          await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
          const [seen] = await tx.select().from(reflowLog).where(eq(reflowLog.id, input.operationId!));
          if (seen) return { id: input.id ?? input.operationId! };
          const { operationId, id: proposedId, ...values } = input;
          const [previous] = await tx.select().from(journalEntries).where(eq(journalEntries.date, values.date)).limit(1);
          const id = previous?.id ?? proposedId ?? crypto.randomUUID();
          if (previous) await tx.update(journalEntries).set({ ...values, isDeleted: false, updatedAt: new Date() }).where(eq(journalEntries.id, id));
          else await tx.insert(journalEntries).values({ ...values, id });
          await tx.insert(reflowLog).values({ id: operationId!, reason: "journal-save", changes: JSON.stringify({ journalId: id }), applied: true });
          return { id };
        });
        const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.date, input.date)).limit(1);
        if (existing) {
          await db.update(journalEntries).set({ ...input, updatedAt: new Date() }).where(eq(journalEntries.id, existing.id));
          return { id: existing.id };
        }
        const id = crypto.randomUUID();
        await db.insert(journalEntries).values({ ...input, id });
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
        await getDb().insert(scheduleItems).values({ ...input, id });
        return { id };
      }),
    remove: protectedQuery.input(idInput).mutation(async ({ input }) => {
      await getDb().update(scheduleItems).set({ isDeleted: true, updatedAt: new Date() }).where(eq(scheduleItems.id, input.id));
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
        agencyGoalCurrency: currencyCode.optional(),
      }))
      .mutation(async ({ input }) => {
        await getDb().update(settings).set({ ...input, updatedAt: new Date() }).where(eq(settings.id, "default"));
        return { ok: true };
      }),
  }),

  planning: createRouter({
    freeWindows: protectedQuery
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input }) => {
        const db = getDb();
        const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "default"));
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
        const db = getDb();
        const [stage] = await db.select().from(stages).where(eq(stages.id, input.stageId));
        if (!stage) throw new TRPCError({ code: "NOT_FOUND" });
        const [project] = await db.select().from(projects).where(eq(projects.id, stage.projectId));
        const stageTasks = (await db.select().from(tasks)).filter(
          (task) => !task.isDeleted && task.stageId === input.stageId && task.status !== "done",
        );
        const windowsByDay: Record<string, { startMin: number; endMin: number }[]> = {};
        const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "default"));
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
          await db.insert(scheduledBlocks).values({ id: crypto.randomUUID(), taskId: allocation.taskId, start, end });
          await db.update(tasks).set({ plannedStart: start, plannedEnd: end, updatedAt: new Date() }).where(eq(tasks.id, allocation.taskId));
        }
        return { count: allocations.length, allocations };
      }),
    reflow: protectedQuery.mutation(async () => {
      const db = getDb();
      const [settingsRow] = await db.select().from(settings).where(eq(settings.id, "default"));
      const today = dayKey(new Date(), settingsRow?.timezone);
      const fixed = await scheduleForDate(today);
      const blocks = active(await db.select().from(scheduledBlocks)).filter((block) => dayKey(block.start, settingsRow?.timezone) === today && block.status === "planned");
      const blockTasks = active(await db.select().from(tasks));
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
          await db.update(scheduledBlocks).set({ start, end, status: "moved", updatedAt: new Date() }).where(eq(scheduledBlocks.id, block.id));
          changed.push({ id: block.id, start, end });
        }
      }
      for (const id of result.removed) {
        await db.update(scheduledBlocks).set({ status: "moved", isDeleted: true, updatedAt: new Date() }).where(eq(scheduledBlocks.id, id));
      }
      await db.insert(reflowLog).values({ id: crypto.randomUUID(), reason: "Пересборка оставшегося дня", changes: JSON.stringify({ changed, removed: result.removed }) });
      return { moved: changed.length, removed: result.removed.length };
    }),
  }),

  exportData: protectedQuery.query(async () => {
    const db = getDb();
    return {
      exportedAt: new Date(),
      projects: active(await db.select().from(projects).where(ne(projects.isDeleted, true))),
      tasks: active(await db.select().from(tasks).where(ne(tasks.isDeleted, true))),
      transactions: active(await db.select().from(transactions).where(ne(transactions.isDeleted, true))),
      journal: active(await db.select().from(journalEntries).where(ne(journalEntries.isDeleted, true))),
    };
  }),
});
