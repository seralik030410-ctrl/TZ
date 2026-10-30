import { it, expect } from "vitest";
import { scheduleForDay } from "./schedule";
const item = { id: "class", weekdays: "1,2,3,4,5", weekParity: "all", startMin: 540, endMin: 600 };
it("shows a one-off event only on its exact date", () => { const once = { ...item, onDate: "2026-10-31" }; expect(scheduleForDay([once], [], "2026-10-31")).toHaveLength(1); expect(scheduleForDay([once], [], "2026-11-07")).toHaveLength(0); });
it("cancels only the selected date", () => { const changes = [{ itemId: "class", date: "2026-10-30", action: "cancel", startMin: null, endMin: null }]; expect(scheduleForDay([item], changes, "2026-10-30")).toHaveLength(0); expect(scheduleForDay([item], changes, "2026-11-02")).toHaveLength(1); });
it("replaces times without modifying the template", () => { const result = scheduleForDay([item], [{ itemId: "class", date: "2026-10-30", action: "move", startMin: 600, endMin: 660 }], "2026-10-30"); expect(result[0].startMin).toBe(600); expect(item.startMin).toBe(540); });
it("respects ISO week parity", () => { expect(scheduleForDay([{ ...item, weekParity: "even" }], [], "2026-10-30")).toHaveLength(1); expect(scheduleForDay([{ ...item, weekParity: "odd" }], [], "2026-10-30")).toHaveLength(0); });
