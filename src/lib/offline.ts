import superjson from "superjson";
import type { PlannerData } from "./planner";

const DB_NAME = "planner-offline";
const STORE_NAME = "mutations";
let activeAccount: string | null = null;
export const getOfflineAccount = () => activeAccount;
export const getTaskEpoch = () => activeAccount ? Number(localStorage.getItem(`ritm-task-epoch:${activeAccount}`) ?? 0) : 0;
export function setTaskEpoch(epoch: number) {
  if (!activeAccount || getTaskEpoch() === epoch) return;
  localStorage.setItem(`ritm-task-epoch:${activeAccount}`, String(epoch));
  for (const key of ["ritm-last-task-move", "ritm-last-daily-plan"]) localStorage.removeItem(accountStorageKey(key));
  window.dispatchEvent(new Event("module-queue-change"));
}
export const setOfflineAccount = (id: string | null) => { activeAccount = id; };
export function accountStorageKey(key: string) {
  if (!activeAccount) throw new Error("Войдите в профиль перед работой с данными");
  return `${key}:${activeAccount}`;
}
export async function quarantineLegacyQueue() {
  const database = await openDatabase();
  try {
    const rows = await new Promise<QueuedMutation[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const legacy = rows.filter(row => !row.accountId);
    // Unknown ownership must never be inferred from the current session.
    if (legacy.length) {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        for (const row of legacy) tx.objectStore(STORE_NAME).delete(row.id);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem("planner-legacy-queue-notice", String(legacy.length));
    }
    return Number(localStorage.getItem("planner-legacy-queue-notice") ?? 0);
  } finally { database.close(); }
}

export type QueuedMutation = {
  id: string;
  path: "planner.tasks.create" | "planner.tasks.reorder" | "planner.tasks.undoReorder" | "planner.money.add" | "planner.journal.save" | "agency.save" | "agency.remove" | "gold.save" | "gold.remove" | "debts.save" | "debts.remove";
  input: unknown;
  createdAt: number;
  accountId: string;
  taskEpoch?: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueMutation(mutation: Omit<QueuedMutation, "createdAt" | "accountId">, accountId = activeAccount) {
  if (!accountId || accountId !== activeAccount) throw new Error("Профиль изменился. Войдите снова перед сохранением.");
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...mutation, id: `${accountId}:${mutation.id}`, accountId, taskEpoch: getTaskEpoch(), createdAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  window.dispatchEvent(new Event("module-queue-change"));
}

export function projectPlannerData(data: PlannerData, pending: QueuedMutation[]): PlannerData {
  pending = pending.filter(mutation => mutation.accountId === data.user.id && (mutation.taskEpoch ?? 0) === (data.settings?.taskEpoch ?? 0));
  if (!pending.some(m => m.path.startsWith("planner.tasks."))) return data;
  let tasks = [...data.tasks];
  const previous = new Map<string, typeof tasks>();
  for (const mutation of pending) {
    const input = mutation.input as Record<string, unknown>;
    if (mutation.path === "planner.tasks.create" && !tasks.some(t => t.id === input.id)) tasks.push({ ownerId: mutation.accountId, workspaceId: input.workspaceId as string ?? data.projects.find(p => p.id === input.projectId)?.workspaceId ?? null, scheduleItemId: input.scheduleItemId as string ?? null, id: String(input.id), title: String(input.title), projectId: input.projectId as string ?? null, stageId: input.stageId as string ?? null, parentId: input.parentId as string ?? null, notes: input.notes as string ?? null, due: input.due as string ?? null, estimateMin: Number(input.estimateMin ?? 30), importance: Number(input.importance ?? 2), isMit: Boolean(input.isMit), status: "plan", flexibility: String(input.flexibility ?? "flexible"), recurrence: null, dependsOn: null, plannedStart: null, plannedEnd: null, completedAt: null, position: tasks.length, isDeleted: false, createdAt: new Date(mutation.createdAt), updatedAt: new Date(mutation.createdAt) });
    if (mutation.path === "planner.tasks.reorder") {
      previous.set(String(input.operationId), [...tasks]);
      const row = tasks.find(t => t.id === input.id); if (!row) continue;
      const next = tasks.filter(t => t.id !== row.id); const index = input.beforeId ? next.findIndex(t => t.id === input.beforeId) : next.length;
      if (index < 0) continue;
      next.splice(index, 0, { ...row, status: String(input.status), completedAt: input.status === "done" ? row.completedAt ?? new Date(mutation.createdAt) : null });
      tasks = next.map((t, position) => ({ ...t, position }));
    }
    if (mutation.path === "planner.tasks.undoReorder") tasks = previous.get(String(input.operationId)) ?? tasks;
  }
  return { ...data, tasks };
}

export async function queuedCount() { return (await pendingMutations()).length; }

export async function pendingMutations(): Promise<QueuedMutation[]> {
  const accountId = activeAccount;
  if (!accountId) return [];
  const database = await openDatabase();
  try { return await new Promise((resolve, reject) => { const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(); request.onsuccess = () => resolve((request.result as QueuedMutation[]).filter(row => row.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt)); request.onerror = () => reject(request.error); }); }
  finally { database.close(); }
}

const inFlight = new Map<string, Promise<number>>();
export function replayQueue() {
  const accountId = activeAccount;
  if (!accountId) return Promise.resolve(0);
  if (!inFlight.has(accountId)) inFlight.set(accountId, replay(accountId).finally(() => { inFlight.delete(accountId); }));
  return inFlight.get(accountId)!;
}
async function replay(accountId: string) {
  if (!navigator.onLine || !("indexedDB" in window)) return 0;
  const database = await openDatabase();
  const mutations = await new Promise<QueuedMutation[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedMutation[]);
    request.onerror = () => reject(request.error);
  });
  let replayed = 0;
  for (const mutation of mutations.filter(row => row.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt)) {
    if (activeAccount !== accountId) break;
    if (mutation.path.startsWith("planner.tasks.") && (mutation.taskEpoch ?? 0) !== getTaskEpoch()) continue;
    try {
      const response = await fetch(`/api/trpc/${mutation.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Planner-Account": accountId, "X-Planner-Task-Epoch": String(mutation.taskEpoch ?? 0) },
        credentials: "include",
        body: JSON.stringify(superjson.serialize(mutation.input)),
      });
      const body = await response.json();
      if (!response.ok || body.error) {
        window.dispatchEvent(new CustomEvent("module-sync-error", { detail: body.error?.json?.message ?? "Запись не синхронизирована. Проверьте данные и сеанс." }));
        break;
      }
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(mutation.id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      replayed += 1;
    } catch {
      window.dispatchEvent(new CustomEvent("module-sync-error", { detail: "Не удалось подключиться к серверу" }));
      break;
    }
  }
  database.close();
  window.dispatchEvent(new Event("module-queue-change"));
  return replayed;
}
