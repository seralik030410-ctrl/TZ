export function completion(items: { status: string; isDeleted?: boolean }[]) {
  const active = items.filter(item => !item.isDeleted);
  const done = active.filter(item => item.status === "done").length;
  return { done, total: active.length, percent: active.length ? Math.round(done / active.length * 100) : 0 };
}
