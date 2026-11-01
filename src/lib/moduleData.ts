import { useEffect, useState } from "react";
import { currencyCode } from "@contracts/shared";
import superjson from "superjson";
import { toast } from "sonner";
import { queueMutation, pendingMutations, accountStorageKey, getOfflineAccount, getTaskEpoch, type QueuedMutation } from "./offline";

export const currencies: readonly string[] = currencyCode.options;
export type Field = { key: string; label: string; type?: "text" | "date" | "time" | "datetime-local" | "money" | "decimal" | "number" | "textarea" | "checkbox" | "password"; options?: { value: string; label: string }[]; required?: boolean; hint?: string; value?: string | number | boolean | null };
export const options = (items: Record<string, string>) => Object.entries(items).map(([value, label]) => ({ value, label }));
export const currencyField: Field = { key: "currency", label: "Валюта", options: currencies.map(value => ({ value, label: value })), value: "TJS", required: true };

export async function moduleMutation(path: QueuedMutation["path"], input: unknown) {
  const accountId = getOfflineAccount();
  if (!accountId) throw new Error("Войдите в профиль");
  if (navigator.onLine) {
    try {
      const response = await fetch(`/api/trpc/${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Planner-Account": accountId, "X-Planner-Task-Epoch": String(getTaskEpoch()) }, body: JSON.stringify(superjson.serialize(input)) });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error?.json?.message ?? body.error?.message ?? "Сервер отклонил запись");
      toast.success("Запись сохранена"); return;
    } catch (e) { if (!(e instanceof TypeError)) throw e; }
  }
  await queueMutation({ id: crypto.randomUUID(), path, input }, accountId);
  window.dispatchEvent(new Event("module-queue-change"));
  toast.success("Сохранено на устройстве. Отправим при подключении");
}
export function useModuleCache<T>(name: string, serverData: T | undefined) {
  const [cached, setCached] = useState<T | undefined>(() => { try { return superjson.parse(localStorage.getItem(accountStorageKey(`ritm-${name}`)) ?? "null") ?? undefined; } catch { return undefined; } });
  useEffect(() => {
    if (!serverData) return;
    let disposed = false;
    const update = async () => {
      const projected = { ...serverData } as Record<string, unknown>;
      const pending = await pendingMutations();
      for (const mutation of pending.filter(m => m.path.startsWith(`${name}.`))) {
        const input = mutation.input as { record?: { entity: string; data: { id: string } }; entity?: string; id?: string };
        const key = input.record?.entity ?? input.entity;
        if (!key || !Array.isArray(projected[key])) continue;
        const rows = projected[key] as { id: string }[];
        if (input.record) projected[key] = [...rows.filter(r => r.id !== input.record!.data.id), { ...input.record.data, updatedAt: new Date(mutation.createdAt), isDeleted: false }];
        else if (mutation.path.endsWith(".remove")) projected[key] = rows.filter(r => r.id !== input.id);
      }
      if (!disposed) { setCached(projected as T); localStorage.setItem(accountStorageKey(`ritm-${name}`), superjson.stringify(projected)); }
    };
    void update().catch(() => { if (!disposed) setCached(serverData); });
    window.addEventListener("module-queue-change", update);
    return () => { disposed = true; window.removeEventListener("module-queue-change", update); };
  }, [name, serverData]);
  const set = (next: T) => { setCached(next); localStorage.setItem(accountStorageKey(`ritm-${name}`), superjson.stringify(next)); };
  return [cached, set] as const;
}
