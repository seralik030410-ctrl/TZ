import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { localDayKey } from "@/lib/planner";
import { Modal } from "./Modal";
import { setTaskEpoch } from "@/lib/offline";

export function TaskArchive() {
  const [open, setOpen] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const utils = trpc.useUtils();
  const month = localDayKey().slice(0, 7);
  const list = trpc.taskArchive.list.useQuery();
  const preview = trpc.taskArchive.preview.useQuery({ month, timezone: "Asia/Dushanbe" }, { enabled: open, retry: false });
  const refresh = async () => {
    const data = await utils.planner.bootstrap.fetch();
    setTaskEpoch(data.settings?.taskEpoch ?? 0);
    await utils.invalidate();
  };
  const commit = trpc.taskArchive.commit.useMutation({ onSuccess: async () => { await refresh(); setOpen(false); setOperationId(crypto.randomUUID()); toast.success("Личные задачи сохранены в архиве"); }, onError: e => toast.error(e.message) });
  const restore = trpc.taskArchive.restore.useMutation({ onSuccess: async () => { await refresh(); toast.success("Задачи восстановлены"); }, onError: e => toast.error(e.message) });
  return <section className="card" style={{ marginTop: 18 }}>
    <h2>Начать месяц с чистого списка</h2>
    <p className="small muted">Личные разовые задания можно убрать в обратимый архив. Общие задачи, актуальные повторы, расписание, проекты, деньги и профили сохранятся.</p>
    <button className="button button-ghost" onClick={() => { setOpen(true); void preview.refetch(); }}>Посмотреть состав архива</button>
    {list.error && <p role="alert" className="field-error">Не удалось загрузить архивы. <button className="text-button" onClick={() => void list.refetch()}>Повторить</button></p>}
    {list.data?.map(batch => <div className="list-row" key={batch.id}><div className="list-row-main"><strong>Архив {batch.month}</strong><span>{batch.createdAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Dushanbe" })} · {batch.restoredAt ? "восстановлен" : "сохранён"}</span></div>{!batch.restoredAt && <button className="button button-ghost button-small" disabled={restore.isPending} onClick={() => restore.mutate({ batchId: batch.id })}>Восстановить</button>}</div>)}
    {open && <Modal title={`Личный архив · ${month}`} onClose={() => setOpen(false)}>
      {preview.isFetching ? <p>Проверяем задачи и связи…</p> : preview.error ? <p role="alert">{preview.error.message}</p> : preview.data && <div className="form-grid">
        <p>В архив: <strong>{preview.data.personalCount} личных задач</strong> и {preview.data.blockCount} активных блоков времени.</p>
        <p className="small muted">Останутся: {preview.data.sharedPreservedCount} общих задач и {preview.data.routinesPreservedCount} задач и шагов актуальных повторов. Завершённые личные задания также сохранятся в архиве. Восстановление доступно здесь же.</p>
        {!!preview.data.conflicts.length && <p className="field-error" role="alert">Есть связи с общими задачами. Архивирование остановлено, чтобы сохранить работу участников. Записи: {preview.data.conflicts.join(", ")}</p>}
        <button className="button button-primary" disabled={commit.isPending || !preview.data.personalCount || !!preview.data.conflicts.length} onClick={() => commit.mutate({ month, timezone: "Asia/Dushanbe", operationId, revision: preview.data!.revision })}>{commit.isPending ? "Сохраняем архив…" : `Архивировать личные задачи (${preview.data.personalCount})`}</button>
        <button className="button button-ghost" onClick={() => void preview.refetch()}>Обновить предпросмотр</button>
      </div>}
    </Modal>}
  </section>;
}
