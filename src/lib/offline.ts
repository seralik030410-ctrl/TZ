import superjson from "superjson";
import type { PlannerData } from "./planner";

const DB_NAME = "planner-offline";
const STORE_NAME = "mutations";

export type QueuedMutation = {
  id: string;
  path: "planner.tasks.create" | "planner.tasks.reorder" | "planner.tasks.undoReorder" | "planner.money.add" | "planner.journal.save" | "agency.save" | "agency.remove" | "gold.save" | "gold.remove" | "debts.save" | "debts.remove";
  input: unknown;
  createdAt: number;
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

export async function queueMutation(mutation: Omit<QueuedMutation, "createdAt">) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...mutation, createdAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  window.dispatchEvent(new Event("module-queue-change"));
}

export function projectPlannerData(data: PlannerData, pending: QueuedMutation[]): PlannerData {
  if (!pending.some(m => m.path.startsWith("planner.tasks."))) return data;
  let tasks = [...data.tasks];
  const previous = new Map<string, typeof tasks>();
  for (const mutation of pending) {
    const input = mutation.input as Record<string, unknown>;
    if (mutation.path === "planner.tasks.create" && !tasks.some(t => t.id === input.id)) tasks.push({ id: String(input.id), title: String(input.title), projectId: input.projectId as string ?? null, stageId: input.stageId as string ?? null, parentId: input.parentId as string ?? null, notes: input.notes as string ?? null, due: input.due as string ?? null, estimateMin: Number(input.estimateMin ?? 30), importance: Number(input.importance ?? 2), isMit: Boolean(input.isMit), status: "plan", flexibility: String(input.flexibility ?? "flexible"), recurrence: null, dependsOn: null, plannedStart: null, plannedEnd: null, completedAt: null, position: tasks.length, isDeleted: false, createdAt: new Date(mutation.createdAt), updatedAt: new Date(mutation.createdAt) });
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

export async function queuedCount() {
  const database = await openDatabase();
  const count = await new Promise<number>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return count;
}

export async function pendingMutations(): Promise<QueuedMutation[]> {
  const database = await openDatabase();
  try { return await new Promise((resolve, reject) => { const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(); request.onsuccess = () => resolve((request.result as QueuedMutation[]).sort((a, b) => a.createdAt - b.createdAt)); request.onerror = () => reject(request.error); }); }
  finally { database.close(); }
}

let inFlight: Promise<number> | undefined;
export function replayQueue() {
  if (!inFlight) inFlight = replay().finally(() => { inFlight = undefined; });
  return inFlight;
}
async function replay() {
  if (!navigator.onLine || !("indexedDB" in window)) return 0;
  const database = await openDatabase();
  const mutations = await new Promise<QueuedMutation[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedMutation[]);
    request.onerror = () => reject(request.error);
  });
  let replayed = 0;
  for (const mutation of mutations.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const response = await fetch(`/api/trpc/${mutation.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
