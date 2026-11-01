import { Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { Task } from "@/lib/planner";

export function TaskCompletion({ task }: { task: Task }) {
  const utils = trpc.useUtils();
  const update = trpc.planner.tasks.update.useMutation({ onSuccess: () => utils.planner.bootstrap.invalidate(), onError: error => toast.error(error.message) });
  const done = task.status === "done";
  return <button type="button" role="checkbox" aria-checked={done} aria-label={`${done ? "Вернуть в работу" : "Выполнить"}: ${task.title}`} className={`task-check ${done ? "checked" : ""}`} disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: done ? "plan" : "done" })}>{done && <Check size={15} />}</button>;
}
