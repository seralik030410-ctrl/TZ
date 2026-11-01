type ArchiveTask = { id: string; ownerId: string; workspaceId: string | null; projectId: string | null; parentId: string | null; dependsOn: string | null; recurrence: string | null; due: string | null; isDeleted: boolean };
export function selectArchive(rows: ArchiveTask[], projects: { id: string; workspaceId: string | null }[], ownerId: string, day: string) {
  const active = rows.filter(t => !t.isDeleted);
  const preserved = new Set(active.filter(t => t.recurrence && t.due && t.due >= day).map(t => t.id));
  for (const t of active) if (t.parentId && preserved.has(t.parentId)) preserved.add(t.id);
  const conflicts = active.filter(t => t.ownerId === ownerId && !t.workspaceId && projects.find(p => p.id === t.projectId)?.workspaceId).map(t => t.id);
  const candidates = active.filter(t => t.ownerId === ownerId && !t.workspaceId && !preserved.has(t.id) && !projects.find(p => p.id === t.projectId)?.workspaceId);
  const ids = new Set(candidates.map(t => t.id));
  for (const t of active) if (!ids.has(t.id) && (t.parentId && ids.has(t.parentId) || t.dependsOn && ids.has(t.dependsOn))) conflicts.push(t.id);
  return { taskIds: [...ids], conflicts: [...new Set(conflicts)], sharedPreservedCount: active.filter(t => !!t.workspaceId).length, routinesPreservedCount: active.filter(t => t.ownerId === ownerId && preserved.has(t.id)).length };
}
