import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare2,
  FolderKanban,
  Home,
  Menu,
  Plus,
  Search,
  Timer,
  WalletCards,
} from "lucide-react";
import { QuickAdd } from "./QuickAdd";
import { trpc } from "@/providers/trpc";
import { dayLabel, localDayKey, type LayoutContext, type PlannerData, type QuickAddKind } from "@/lib/planner";

const navItems = [
  { path: "/", label: "Сегодня", icon: Home },
  { path: "/tasks", label: "Задачи", icon: CheckSquare2 },
  { path: "/projects", label: "Проекты", icon: FolderKanban },
  { path: "/money", label: "Деньги", icon: WalletCards },
  { path: "/more", label: "Ещё", icon: Menu },
];

export function Layout({ data }: { data: PlannerData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const [quickAdd, setQuickAdd] = useState<QuickAddKind | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const today = localDayKey();
  const overdue = data.tasks.filter((task) => task.status !== "done" && task.due && task.due < today);
  const urgent = data.tasks.filter((task) => task.status !== "done" && task.due === today);
  const name = data.settings?.name ?? "Алекс";
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", data.settings?.theme === "dark");
  }, [data.settings?.theme]);

  useEffect(() => {
    setSearchOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return { tasks: [], projects: [], journal: [] };
    return {
      tasks: data.tasks.filter((task) => `${task.title} ${task.notes ?? ""}`.toLocaleLowerCase("ru").includes(normalized)).slice(0, 5),
      projects: data.projects.filter((project) => project.name.toLocaleLowerCase("ru").includes(normalized)).slice(0, 3),
      journal: data.journal.filter((entry) => `${entry.text ?? ""} ${entry.insight ?? ""} ${entry.tags}`.toLocaleLowerCase("ru").includes(normalized)).slice(0, 3),
    };
  }, [query, data]);

  const refresh = () => { void utils.planner.bootstrap.invalidate(); };
  const openQuickAdd = (kind: QuickAddKind = "task") => setQuickAdd(kind);
  const context: LayoutContext = { data, refresh, openQuickAdd };
  const activePath = (path: string) => {
    if (path === "/more") return ["/more", "/schedule", "/journal", "/week", "/settings", "/agency", "/gold", "/debts"].includes(location.pathname);
    return location.pathname === path;
  };

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="Основная навигация">
        <button className="brand" type="button" onClick={() => navigate("/")} style={{ border: 0, background: "transparent", textAlign: "left" }}>
          <span className="brand-mark">Р</span>
          <span className="brand-copy"><strong>Ритм</strong><span>личный ежедневник</span></span>
        </button>
        <nav className="rail-nav">
          {navItems.map((item) => (
            <button key={item.path} type="button" className={`rail-item ${activePath(item.path) ? "active" : ""}`} onClick={() => navigate(item.path)}>
              <item.icon size={19} />{item.label}
              {item.path === "/tasks" && overdue.length > 0 && <span className="badge badge-danger" style={{ marginLeft: "auto" }}>{overdue.length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 20 }}>
          <button className="button button-primary button-wide" type="button" onClick={() => openQuickAdd("task")}><Plus size={18} />Добавить</button>
        </div>
        <div className="rail-footer">
          <span className="dot" style={{ display: "inline-block", marginRight: 7, background: "var(--success)" }} />
          Данные сохраняются на сервере
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="brand" type="button" onClick={() => navigate("/")} style={{ border: 0, background: "transparent", textAlign: "left" }} aria-label="На главную">
            <span className="brand-mark">Р</span>
            <span className="brand-copy"><strong>Ритм</strong><span>личный ежедневник</span></span>
          </button>
          <div className="topbar-spacer" />
          {data.activeTimer && (
            <button className="button button-small button-ghost quick-add-desktop" type="button" onClick={() => navigate("/projects")}>
              <Timer size={16} />Фокус идёт
            </button>
          )}
          <button className="button button-primary button-small quick-add-desktop" type="button" onClick={() => openQuickAdd("task")}><Plus size={17} />Добавить</button>
          <button className="icon-button" type="button" onClick={() => { setSearchOpen(!searchOpen); setNotificationsOpen(false); }} aria-label="Поиск" aria-expanded={searchOpen}>
            <Search size={20} />
          </button>
          <button className="icon-button" type="button" onClick={() => { setNotificationsOpen(!notificationsOpen); setSearchOpen(false); }} aria-label={`Уведомления: ${overdue.length + urgent.length}`} aria-expanded={notificationsOpen} style={{ position: "relative" }}>
            <Bell size={20} />
            {(overdue.length + urgent.length) > 0 && <span className="nav-badge" style={{ top: 1, right: 0 }}>{overdue.length + urgent.length}</span>}
          </button>
          <button className="avatar" type="button" onClick={() => navigate("/settings")} aria-label="Открыть настройки">{initials}</button>
        </header>

        {searchOpen && (
          <section className="popover" aria-label="Поиск по ежедневнику">
            <div className="field">
              <label htmlFor="global-search">Найти задачу, проект или запись</label>
              <input id="global-search" autoFocus className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Начните вводить…" />
            </div>
            {!query && <p className="muted small">Поиск работает по всем основным разделам.</p>}
            {query && searchResults.tasks.length + searchResults.projects.length + searchResults.journal.length === 0 && <p className="muted small">Ничего не найдено. Попробуйте другое слово.</p>}
            <div className="search-results">
              {searchResults.tasks.map((task) => (
                <button className="search-result" type="button" key={task.id} onClick={() => navigate("/tasks")}><CheckSquare2 size={18} /><div><strong>{task.title}</strong><span>Задача · {dayLabel(task.due)}</span></div></button>
              ))}
              {searchResults.projects.map((project) => (
                <button className="search-result" type="button" key={project.id} onClick={() => navigate("/projects")}><FolderKanban size={18} /><div><strong>{project.name}</strong><span>Проект</span></div></button>
              ))}
              {searchResults.journal.map((entry) => (
                <button className="search-result" type="button" key={entry.id} onClick={() => navigate("/journal")}><BookOpen size={18} /><div><strong>{entry.text || entry.insight || "Запись дня"}</strong><span>Дневник · {entry.date}</span></div></button>
              ))}
            </div>
          </section>
        )}

        {notificationsOpen && (
          <section className="popover" aria-label="Требует внимания">
            <div className="section-title" style={{ marginTop: 0 }}><h3>Требует внимания</h3><span className="badge badge-danger">{overdue.length + urgent.length}</span></div>
            {overdue.length + urgent.length === 0 && <p className="muted small">Всё спокойно. Горящих и просроченных дел нет.</p>}
            {[...overdue, ...urgent].slice(0, 6).map((task) => (
              <div className="attention-item" key={task.id}>
                <CalendarDays size={18} color={task.due && task.due < today ? "var(--danger)" : "var(--warning)"} />
                <div className="list-row-main"><strong>{task.title}</strong><span>{dayLabel(task.due)}</span></div>
                <button className="text-button" type="button" onClick={() => navigate("/tasks")}>Открыть</button>
              </div>
            ))}
          </section>
        )}

        <main><Outlet context={context} /></main>
      </div>

      <div className="bottom-nav-wrap">
        <nav className="bottom-nav" aria-label="Основная навигация">
          {navItems.map((item) => (
            <button key={item.path} type="button" className={`nav-item ${activePath(item.path) ? "active" : ""}`} onClick={() => navigate(item.path)} aria-current={activePath(item.path) ? "page" : undefined}>
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.path === "/tasks" && overdue.length > 0 && <span className="nav-badge">{overdue.length}</span>}
            </button>
          ))}
        </nav>
      </div>
      <button className="fab" type="button" onClick={() => openQuickAdd("task")} aria-label="Быстрое добавление"><Plus size={27} /></button>

      {quickAdd && <QuickAdd kind={quickAdd} data={data} onClose={() => setQuickAdd(null)} />}
    </div>
  );
}
