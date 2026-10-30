import { useNavigate, useOutletContext } from "react-router";
import { ArrowRight, BookOpen, CalendarDays, CalendarRange, Download, Plus, Settings2, BriefcaseBusiness, Gem, HandCoins } from "lucide-react";
import type { LayoutContext } from "@/lib/planner";

export default function More() {
  const navigate = useNavigate();
  const { openQuickAdd, data } = useOutletContext<LayoutContext>();
  const items = [
    ...(data.settings?.goldEnabled !== false ? [{ path: "/gold", title: "Золото", text: "Журнал, риск и дисциплина торговли", icon: Gem, color: "var(--cat-personal)" }] : []),
    ...(data.settings?.agencyEnabled !== false ? [{ path: "/agency", title: "Агентство", text: "Клиенты, сделки, визы и путешествия", icon: BriefcaseBusiness, color: "var(--cat-agency)" }] : []),
    ...(data.settings?.debtsEnabled !== false ? [{ path: "/debts", title: "Долги", text: "Платежи, остатки и сроки возврата", icon: HandCoins, color: "var(--cat-money)" }] : []),
    { path: "/schedule", title: "Расписание", text: "Недельный шаблон и свободные окна", icon: CalendarDays, color: "var(--cat-study)" },
    { path: "/journal", title: "Дневник", text: "Итоги дня, настроение и заметки", icon: BookOpen, color: "var(--cat-personal)" },
    { path: "/week", title: "Неделя", text: "Проекты, расходы и средняя энергия", icon: CalendarRange, color: "var(--cat-money)" },
    { path: "/settings", title: "Настройки", text: "Лимиты, тема, рабочие часы и экспорт", icon: Settings2, color: "var(--accent)" },
  ];
  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Всё, что помогает держать ритм</p><h1>Ещё</h1><p className="subtitle">Расписание, дневник, недельная сводка и управление приложением.</p></div></div>
      <div className="project-grid stagger">
        {items.map((item) => (
          <button className="card card-interactive" style={{ textAlign: "left" }} type="button" key={item.path} onClick={() => navigate(item.path)}>
            <item.icon size={26} color={item.color} />
            <h2 style={{ margin: "18px 0 5px", fontSize: 20 }}>{item.title}</h2>
            <p className="small muted" style={{ margin: 0 }}>{item.text}</p>
            <span className="text-button" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10 }}>Открыть <ArrowRight size={14} /></span>
          </button>
        ))}
      </div>
      <section className="card accent-card" style={{ marginTop: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Не держите в голове</p><h2>Быстрая заметка</h2></div><Plus size={22} color="var(--accent)" /></div>
        <p className="small muted">Запишите мысль сейчас — она сохранится в сегодняшнем дневнике.</p>
        <button className="button button-primary" type="button" onClick={() => openQuickAdd("note")}>Добавить заметку <ArrowRight size={16} /></button>
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}><h2>Данные под контролем</h2><Download size={20} color="var(--text-soft)" /></div>
        <p className="small muted">Все основные записи хранятся в базе приложения. Ручной экспорт JSON и CSV доступен в настройках.</p>
        <button className="button button-ghost" type="button" onClick={() => navigate("/settings")}>Перейти к экспорту</button>
      </section>
    </div>
  );
}
