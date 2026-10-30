import { DateField } from "@/components/FormControls";
import { useState } from "react";
import { CalendarRange, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { PlannerData } from "@/lib/planner";
import { minutesToTime, timeToMinutes, formatDuration } from "@/lib/planner";
import { dayInZone, minutesInZone } from "@contracts/shared";
import { Modal } from "./Modal";

export function DailyPlanner({ data, mode = "append" }: { data: PlannerData; mode?: "append" | "reflow" }) {
  const [open, setOpen] = useState(false);
  const [undoId, setUndoId] = useState(() => localStorage.getItem("ritm-last-daily-plan"));
  const utils = trpc.useUtils();
  const undo = trpc.daily.undo.useMutation({ onSuccess: async () => { localStorage.removeItem("ritm-last-daily-plan"); setUndoId(null); await utils.planner.bootstrap.invalidate(); toast.success("Раскладка отменена"); }, onError: e => toast.error(e.message) });
  return <><button className="button button-ghost" onClick={() => setOpen(true)}><CalendarRange size={18} />{mode === "reflow" ? "Пересобрать оставшийся день" : "Составить план дня"}</button>{undoId && <button className="button button-ghost" disabled={undo.isPending} onClick={() => undo.mutate({ id: undoId })}><Undo2 size={16} />Отменить раскладку</button>}{open && <PlanDialog mode={mode} data={data} onClose={() => setOpen(false)} onApplied={id => { setUndoId(id); localStorage.setItem("ritm-last-daily-plan", id); }} />}</>;
}
function PlanDialog({ data, onClose, onApplied, mode }: { mode: "append" | "reflow"; data: PlannerData; onClose: () => void; onApplied: (id: string) => void }) {
  const zone = data.settings?.timezone ?? "Asia/Dushanbe";
  const today = dayInZone(new Date(), zone);
  const [day, setDay] = useState(today);
  const [startMin, setStartMin] = useState(Math.min(1410, Math.max(data.settings?.workStartMin ?? 480, Math.ceil((minutesInZone(new Date(), zone) + 1) / 30) * 30)));
  const [reservePercent, setReservePercent] = useState(20);
  const [selected, setSelected] = useState<string[]>(data.tasks.filter(t => t.status !== "done" && t.flexibility !== "fixed").map(t => t.id));
  const [showPreview, setShowPreview] = useState(false);
  const utils = trpc.useUtils();
  const input = { day, startMin, reservePercent, taskIds: selected, mode };
  const preview = trpc.daily.preview.useQuery(input, { enabled: showPreview, retry: false });
  const apply = trpc.daily.commitPlan.useMutation({ onSuccess: async result => { onApplied(result.id); await utils.planner.bootstrap.invalidate(); toast.success("Рабочие блоки добавлены в план дня"); onClose(); }, onError: e => toast.error(e.message) });
  const candidates = data.tasks.filter(t => t.status !== "done" && t.flexibility !== "fixed");
  return <Modal title="План на день" onClose={onClose}><div className="form-grid"><p className="small muted">Выберите задачи. Раскладка учтёт занятия и существующие блоки, сохранит резерв и покажет, что не помещается.</p><div className="form-row"><div className="field"><label htmlFor="plan-date">День</label><DateField className="input" id="plan-date" min={today} value={day} onChange={e => { setDay(e.target.value); setShowPreview(false); if (e.target.value > today) setStartMin(data.settings?.workStartMin ?? 480); }} /></div><div className="field"><label htmlFor="plan-start">Не раньше</label><input className="input" id="plan-start" type="time" value={minutesToTime(startMin)} onChange={e => { setStartMin(timeToMinutes(e.target.value)); setShowPreview(false); }} /></div></div><div className="field"><label htmlFor="plan-reserve">Резерв свободного времени, %</label><input className="input" id="plan-reserve" type="number" min={0} max={50} value={reservePercent} onChange={e => { setReservePercent(Number(e.target.value)); setShowPreview(false); }} /></div><div className="daily-task-options">{candidates.map(task => <label className="list-row" key={task.id}><input type="checkbox" checked={selected.includes(task.id)} onChange={e => { setSelected(current => e.target.checked ? [...current, task.id] : current.filter(id => id !== task.id)); setShowPreview(false); }} /><span className="list-row-main"><strong>{task.title}</strong><span>{task.isMit ? "Главная · " : ""}{formatDuration(task.estimateMin)}{task.due ? ` · срок ${task.due}` : ""}</span></span></label>)}</div>{!candidates.length && <p className="small muted">Сначала добавьте задачи.</p>}<button className="button button-primary" disabled={!selected.length || preview.isFetching} onClick={() => { setShowPreview(true); if (showPreview) void preview.refetch(); }}>{preview.isFetching ? "Считаем свободные окна…" : "Предпросмотр"}</button>{showPreview && preview.error && <p role="alert" className="form-error">{preview.error.message}</p>}{showPreview && preview.data && !preview.isFetching && <section className="daily-preview"><h3>Предлагаемая раскладка</h3><p className="small muted">Задачи: {formatDuration(preview.data.plannedMinutes)} · резерв: {formatDuration(preview.data.reserved)} · {zone}</p>{preview.data.blocks.map((block, index) => <div className="list-row" key={`${block.taskId}-${index}`}><span className="badge">{minutesToTime(block.startMin)}–{minutesToTime(block.endMin)}</span><span className="list-row-main"><strong>{data.tasks.find(t => t.id === block.taskId)?.title}</strong></span></div>)}{preview.data.unallocated.length > 0 && <><h3>Не поместилось</h3>{preview.data.unallocated.map(t => <p className="small muted" key={t.taskId}><strong>{t.title}</strong> · {formatDuration(t.minutes)}<br />{t.reason}</p>)}</>}{!preview.data.blocks.length ? <p className="small muted">Подходящих окон нет. Измените день, время или объём задач.</p> : <button className="button button-primary button-wide" disabled={apply.isPending} onClick={() => apply.mutate({ ...input, operationId: crypto.randomUUID(), revision: preview.data!.revision })}>{apply.isPending ? "Применяем…" : "Применить раскладку"}</button>}</section>}</div></Modal>;
}
