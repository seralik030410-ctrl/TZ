import { createRouter, publicQuery } from "./middleware";
import { plannerRouter } from "./plannerRouter";
import { agencyRouter } from "./agencyRouter";
import { goldRouter } from "./goldRouter";
import { debtsRouter } from "./debtsRouter";
import { dailyRouter } from "./dailyRouter";
import { calendarRouter } from "./calendarRouter";
import { routinesRouter } from "./routinesRouter";
import { sharingRouter } from "./sharingRouter";
import { taskArchiveRouter } from "./taskArchiveRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  planner: plannerRouter,
  agency: agencyRouter,
  gold: goldRouter,
  debts: debtsRouter,
  daily: dailyRouter,
  calendar: calendarRouter,
  routines: routinesRouter,
  sharing: sharingRouter,
  taskArchive: taskArchiveRouter,
});

export type AppRouter = typeof appRouter;
