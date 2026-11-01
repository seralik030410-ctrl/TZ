import { z } from "zod";
import { calendarDate, money } from "./shared";
export const projectUpdateSchema = z.object({
  id: z.string().min(1).max(36),
  name: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  type: z.enum(["money", "study", "personal", "agency"]).optional(),
  deadline: calendarDate.nullable().optional(),
  expectedIncome: money.optional(),
  nextStep: z.string().max(2000).nullable().optional(),
  dailyMinutesGoal: z.number().int().min(0).max(1440).optional(),
  weeklyMinutesGoal: z.number().int().min(0).max(10080).optional(),
});
