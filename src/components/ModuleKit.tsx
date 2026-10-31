import { AppSelect, DateField } from "@/components/FormControls";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Download, Plus, Search, ArrowUpRight, Inbox, WifiOff } from "lucide-react";
import { z } from "zod";
import superjson from "superjson";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { queueMutation, pendingMutations, accountStorageKey, getOfflineAccount, type QueuedMutation } from "@/lib/offline";
import { downloadJson, minutesToTime, timeToMinutes, getUserTimezone } from "@/lib/planner";
import { minorUnits, dayInZone, minutesInZone, zonedDateAt } from "@contracts/shared";

export const currencies = ["TJS", "USD", "RUB"];
export type Field = { key: string; label: string; type?: "text" | "date" | "time" | "datetime-local" | "money" | "decimal" | "number" | "textarea" | "checkbox" | "password"; options?: { value: string; label: string }[]; required?: boolean; hint?: string; value?: string | number | boolean | null };
export const options = (items: Record<string, string>) => Object.entries(items).map(([value, label]) => ({ value, label }));
export const currencyField: Field = { key: "currency", label: "Валюта", options: currencies.map(value => ({ value, label: value })), value: "TJS", required: true };

export function RecordForm({ title, fields, initial, schema, onSave, onClose, onDelete }: { title: string; fields: Field[]; initial?: Record<string, unknown>; schema: z.ZodType; onSave: (value: Record<string, unknown>) => Promise<void>; onClose: () => void; onDelete?: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recordId] = useState(() => initial?.id ?? crypto.randomUUID());
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget);
    try {
      const raw: Record<string, unknown> = { ...initial, id: recordId };
      for (const f of fields) {
        const value = String(values.get(f.key) ?? "");
        raw[f.key] = f.type === "checkbox" ? values.get(f.key) === "on" : f.type === "money" ? minorUnits(value.replace(",", ".")) : f.type === "number" ? Number(value) : f.type === "date" ? value || null : f.type === "time" ? value ? timeToMinutes(value) : null : f.type === "datetime-local" && value ? zonedDateAt(value.slice(0, 10), timeToMinutes(value.slice(11, 16)), getUserTimezone()).toISOString() : value;
      }
      const parsed = schema.parse(raw) as Record<string, unknown>;
      setBusy(true); await onSave(parsed); onClose();
    } catch (e) { setError(e instanceof z.ZodError ? e.issues.map(i => `${fields.find(f => f.key === i.path[0])?.label ?? i.path.join(".")}: ${i.message}`).join(". ") : e instanceof Error ? e.message : "Не удалось сохранить"); }
    finally { setBusy(false); }
  };
  return <Modal title={title} onClose={onClose}><form className="form-grid module-form" onSubmit={submit}>
    {fields.map(f => { const value = initial?.[f.key] ?? f.value ?? ""; const defaultValue = f.type === "datetime-local" && value ? `${dayInZone(new Date(String(value)), getUserTimezone())}T${minutesToTime(minutesInZone(new Date(String(value)), getUserTimezone()))}` : f.type === "money" && initial?.[f.key] != null ? String(Number(value) / 100) : f.type === "time" && value !== "" ? String(value).includes(":") ? String(value) : minutesToTime(Number(value)) : String(value); return <div className={`field ${f.type === "textarea" ? "field-wide" : ""}`} key={f.key}>
      <label htmlFor={`field-${f.key}`}>{f.label}</label>
      {f.options ? <AppSelect id={`field-${f.key}`} name={f.key} className="select" defaultValue={defaultValue} required={f.required}>{!f.required && <option value="">Не выбрано</option>}{f.options.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</AppSelect>
        : f.type === "textarea" ? <textarea id={`field-${f.key}`} name={f.key} className="textarea" defaultValue={defaultValue} />
        : f.type === "checkbox" ? <input id={`field-${f.key}`} name={f.key} type="checkbox" defaultChecked={Boolean(value)} />
        : f.type === "date" || f.type === "datetime-local" ? <DateField id={`field-${f.key}`} name={f.key} defaultValue={defaultValue} required={f.required} withTime={f.type === "datetime-local"} />
        : <input id={`field-${f.key}`} name={f.key} className="input" type={f.type === "money" || f.type === "decimal" ? "text" : f.type ?? "text"} inputMode={f.type === "money" || f.type === "decimal" ? "decimal" : undefined} defaultValue={defaultValue} required={f.required} />}
      {f.hint && <span className="micro muted">{f.hint}</span>}
    </div>; })}
    {error && <p className="form-error field-wide" role="alert">{error}</p>}
    <button className="button button-primary field-wide" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить"}</button>
    {onDelete && <button className="button button-danger field-wide" type="button" disabled={busy} onClick={onDelete}>Удалить запись</button>}
  </form></Modal>;
}

export async function moduleMutation(path: QueuedMutation["path"], input: unknown) {
  const accountId = getOfflineAccount();
  if (!accountId) throw new Error("Войдите в профиль");
  if (navigator.onLine) {
    try {
      const response = await fetch(`/api/trpc/${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Planner-Account": accountId }, body: JSON.stringify(superjson.serialize(input)) });
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
export function ModuleHeader({ title, eyebrow, subtitle, onAdd, addLabel, data }: { title: string; eyebrow: string; subtitle: string; onAdd?: () => void; addLabel?: string; data: unknown }) {
  return <><div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div><div className="action-row"><ExportMenu name={title} data={data} />{onAdd && <button className="button button-primary" onClick={onAdd}><Plus size={18} />{addLabel ?? "Добавить"}</button>}</div></div>{!navigator.onLine && <p className="module-notice"><WifiOff size={16} />Офлайн · записи сохраняются на этом устройстве</p>}</>;
}
export function ExportMenu({ name, data }: { name: string; data: unknown }) {
  const csv = () => {
    const records: Record<string, unknown>[] = Object.entries(data as Record<string, unknown>).flatMap(([entity, rows]) => Array.isArray(rows) ? rows.map(row => ({ entity, ...row })) : []);
    const columns = [...new Set(records.flatMap(Object.keys))];
    const escape = (value: unknown) => { let str = String(value ?? ""); if (/^[=+\-@\t\r]/.test(str)) str = "'" + str; return '"' + str.replaceAll('"', '""') + '"'; };
    const content = "\uFEFF" + [columns, ...records.map(r => columns.map(c => r[c]))].map(r => r.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <details className="export-menu"><summary className="button button-ghost"><Download size={16} />Экспорт</summary><div className="export-options"><button onClick={() => downloadJson(data, `${name}.json`)}>Скачать JSON</button><button onClick={csv}>Скачать CSV</button><span className="micro muted">Суммы в сотых валюты</span></div></details>;
}
export function Metric({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: string; accent?: boolean }) { return <section className={`card metric-card ${accent ? "accent-card" : ""}`}><ArrowUpRight className="icon" size={19} /><p className="card-label">{label}</p><div className="module-value number">{value}</div>{hint && <p className="metric-footer">{hint}</p>}</section>; }
export function Ring({ percent, label, detail }: { percent: number; label: string; detail: string }) {
  const value = Math.max(0, Math.min(100, percent));
  return <div className="module-ring-wrap"><div className="progress-ring"><svg viewBox="0 0 156 156" aria-hidden="true"><circle className="ring-track" cx="78" cy="78" r="65" /><circle className="ring-value" cx="78" cy="78" r="65" strokeDasharray="408.4" strokeDashoffset={408.4 * (1 - value / 100)} /></svg><div className="ring-copy"><strong className="number">{Math.round(value)}%</strong><span>{label}</span></div></div><p className="small muted">{detail}</p></div>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="empty-state"><Inbox size={30} /><strong>Пока здесь чистый лист</strong><p>{children}</p></div>; }
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) { return <label className="module-search"><Search size={17} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></label>; }
export function LoadingError({ error, retry }: { error: boolean; retry: () => void }) { return <section className="card empty-state"><strong>{error ? "Не удалось загрузить данные" : "Загружаем записи…"}</strong>{error && <button className="button button-primary" onClick={retry}>Повторить</button>}</section>; }
