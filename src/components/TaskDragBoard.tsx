import { useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/lib/planner";

export function TaskDragBoard({ tasks, board, render, onMove }: { tasks: Task[]; board: boolean; render: (task: Task) => ReactNode; onMove: (id: string, beforeId: string | null, status: string) => Promise<void> }) {
  const [rows, setRows] = useState(tasks);
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const end = async ({ active: moved, over }: DragEndEvent) => {
    setActive(null); if (!over || moved.id === over.id) return;
    const original = rows; const row = rows.find(t => t.id === moved.id); if (!row) return;
    const target = rows.find(t => t.id === over.id);
    const status = target?.status ?? String(over.id).replace("column:", "");
    if (!["plan", "doing", "done"].includes(status)) return;
    const next = rows.filter(t => t.id !== row.id); let index = target ? next.findIndex(t => t.id === target.id) : next.length;
    if (target && target.status === row.status && rows.indexOf(row) < rows.indexOf(target)) index++;
    next.splice(index < 0 ? next.length : index, 0, { ...row, status }); setRows(next);
    try { await onMove(row.id, next[next.findIndex(t => t.id === row.id) + 1]?.id ?? null, status); } catch (error) { setRows(original); toast.error((error as Error).message); }
  };
  const column = (key: string, label: string, items: Task[]) => <Column key={key} id={`column:${key}`} board={board} label={label} count={items.length}><SortableContext items={items.map(t => t.id)} strategy={verticalListSortingStrategy}>{items.map(t => <SortableCard key={t.id} id={t.id}>{render(t)}</SortableCard>)}</SortableContext>{!items.length && <p className="empty-state">Перенесите задачу сюда</p>}</Column>;
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e => setActive(String(e.active.id))} onDragCancel={() => setActive(null)} onDragEnd={end}><div className={board ? "kanban" : "task-list"}>{board ? [["plan", "План"], ["doing", "В работе"], ["done", "Готово"]].map(([key, label]) => column(key, label, rows.filter(t => t.status === key))) : column("plan", "", rows)}</div><DragOverlay>{active && rows.some(t => t.id === active) && <div className="task-drag-overlay">{render(rows.find(t => t.id === active)!)}</div>}</DragOverlay></DndContext>;
}
function Column({ id, label, count, board, children }: { id: string; label: string; count: number; board: boolean; children: ReactNode }) { const { setNodeRef, isOver } = useDroppable({ id }); return <section ref={setNodeRef} className={`${board ? "kanban-column" : "task-list"} ${isOver ? "task-drop-active" : ""}`}>{board && <h3>{label}<span>{count}</span></h3>}{children}</section>; }
function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, transition: reduced ? null : { duration: 180, easing: "ease-out" } });
  return <div ref={setNodeRef} className="task-sortable" style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .3 : 1 }}><button ref={setActivatorNodeRef} type="button" className="task-drag-handle" aria-label="Переместить задачу. Пробел — взять, стрелки — переместить, Escape — отменить" {...attributes} {...listeners}><GripVertical size={18} /></button>{children}</div>;
}
