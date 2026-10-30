import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { toast, Toaster } from "sonner";
import superjson from "superjson";
import { Layout } from "@/components/Layout";
import { trpc } from "@/providers/trpc";
import Login from "@/pages/Login";
const Today = lazy(() => import("@/pages/Today"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Projects = lazy(() => import("@/pages/Projects"));
const Money = lazy(() => import("@/pages/Money"));
const More = lazy(() => import("@/pages/More"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const Journal = lazy(() => import("@/pages/Journal"));
const Week = lazy(() => import("@/pages/Week"));
const Settings = lazy(() => import("@/pages/Settings"));
const Agency = lazy(() => import("@/pages/Agency"));
const Gold = lazy(() => import("@/pages/Gold"));
const Debts = lazy(() => import("@/pages/Debts"));
import { setUserTimezone } from "@/lib/planner";
import type { PlannerData } from "@/lib/planner";
import { replayQueue, pendingMutations, projectPlannerData, type QueuedMutation } from "@/lib/offline";

function queuedLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} запись ожидает синхронизации`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} записи ожидают синхронизации`;
  return `${count} записей ожидают синхронизации`;
}

export default function App() {
  const auth = trpc.planner.auth.status.useQuery();
  const bootstrap = trpc.planner.bootstrap.useQuery(undefined, {
    enabled: auth.data?.authenticated === true,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<QueuedMutation[]>([]);
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const count = await replayQueue();
      const remaining = await pendingMutations();
      setPending(remaining);
      if (!remaining.length) {
        setSyncError("");
        if (count) toast.success(`Офлайн-записи синхронизированы: ${count}`);
        if (count) await utils.invalidate();
      } else if (count) await utils.invalidate();
    } catch {
      setSyncError("Не удалось синхронизировать записи. Данные сохранены на этом устройстве.");
    } finally { setSyncing(false); }
  }, [utils]);
  useEffect(() => {
    let disposed = false;
    const update = async () => { const rows = await pendingMutations(); if (!disposed) setPending(rows); };
    const listener = () => { void update().catch(() => {}); };
    listener(); window.addEventListener("module-queue-change", listener);
    return () => { disposed = true; window.removeEventListener("module-queue-change", listener); };
  }, []);
  const [cached] = useState<PlannerData | null>(() => {
    try {
      const value = localStorage.getItem("planner-last-data");
      return value ? superjson.parse<PlannerData>(value) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (bootstrap.data) localStorage.setItem("planner-last-data", superjson.stringify(bootstrap.data));
  }, [bootstrap.data]);

  useEffect(() => {
    const onError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setSyncError(`${message} Запись осталась в очереди.`);
      toast.error(message);
    };
    const onOnline = () => { setOnline(true); void syncQueue(); };
    const onOffline = () => setOnline(false);
    void syncQueue();
    window.addEventListener("module-sync-error", onError);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("module-sync-error", onError); };
  }, [syncQueue]);

  const source = bootstrap.data ?? ((auth.error || bootstrap.error || !navigator.onLine) ? cached : null);
  const appData = source ? projectPlannerData(source, pending) : null;

  if ((auth.isLoading || (auth.data?.authenticated && bootstrap.isLoading)) && !appData) {
    return <div className="page loading-page"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>;
  }
  if ((!auth.data?.authenticated || bootstrap.error?.data?.code === "UNAUTHORIZED") && !appData) return <Login />;
  if (bootstrap.error && !appData) {
    return <div className="page"><section className="card error-state"><h1>Не удалось загрузить ежедневник</h1><p className="subtitle">Проверьте соединение и попробуйте ещё раз. Ваши записи остаются на сервере.</p><button className="button button-primary" type="button" onClick={() => bootstrap.refetch()}>Повторить загрузку</button></section></div>;
  }
  if (!appData) return null;
  setUserTimezone(appData.settings?.timezone);

  return (
    <>
      <Suspense fallback={<div className="page loading-page"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}>
        <Routes>
          <Route element={<Layout data={appData} />}>
            <Route path="/" element={<Today />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/money" element={<Money />} />
            <Route path="/more" element={<More />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/week" element={<Week />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/agency" element={<Agency />} />
            <Route path="/gold" element={<Gold />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      {pending.length > 0 && <aside className={`offline-queue-banner${syncError ? " has-error" : ""}`} role="status"><div><strong>{queuedLabel(pending.length)}</strong><span>{syncError || (online ? "Сохраняем на сервер при подключении" : "Нет сети. Записи сохранены на устройстве.")}</span></div><button className="button button-ghost" type="button" disabled={!online || syncing} onClick={() => void syncQueue()}>{syncing ? "Синхронизируем…" : "Повторить"}</button></aside>}
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: "Manrope, sans-serif", borderRadius: "16px" } }} />
    </>
  );
}
