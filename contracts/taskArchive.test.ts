import { expect, it } from "vitest";
import { selectArchive } from "./taskArchive";
const task = (id: string, extra = {}) => ({ id, ownerId: "me", workspaceId: null, projectId: null, parentId: null, dependsOn: null, recurrence: null, due: null, isDeleted: false, ...extra });
it("archives personal one-off work but preserves friend, shared and November recurrences with their steps", () => {
  const rows = [task("personal"), task("done", { status: "done" }), task("friend", { ownerId: "friend" }), task("shared", { workspaceId: "team" }), task("repeat", { recurrence: "template", due: "2026-11-02" }), task("step", { parentId: "repeat", due: "2026-11-02" }), task("old-repeat", { recurrence: "template", due: "2026-10-31" })];
  expect(selectArchive(rows, [], "me", "2026-11-01").taskIds).toEqual(["personal", "done", "old-repeat"]);
});
it("blocks a shared dependent rather than modifying the friend's work", () => {
  const result = selectArchive([task("p"), task("shared", { workspaceId: "team", dependsOn: "p" })], [], "me", "2026-11-01");
  expect(result.conflicts).toContain("shared");
});
it("blocks inconsistent workspace ownership and preserves tasks in a shared project", () => {
  const result = selectArchive([task("p", { projectId: "project" }), task("child", { ownerId: "friend", parentId: "p" })], [{ id: "project", workspaceId: "team" }], "me", "2026-11-01");
  expect(result.taskIds).toEqual([]);
  expect(result.conflicts).toContain("p");
});
