import { daysLeftInMonth, normalizeCurrency } from "@contracts/shared";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { ArrowDownLeft, ArrowUpRight, Plus, ReceiptText, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { safeToSpendToday } from "@contracts/planning";
import { trpc } from "@/providers/trpc";
import { RecurringBills } from "@/components/RecurringBills";
import { formatMoney, localDayKey, type LayoutContext } from "@/lib/planner";

export default function Money() {
  const context = useOutletContext<LayoutContext>();
  const { openQuickAdd } = context;
  const data = { ...context.data, transactions: context.data.transactions.filter(t => t.currency === normalizeCurrency(context.data.settings?.currency)) };
  const utils = trpc.useUtils();
  const paymentStatus = trpc.planner.money.setStatus.useMutation({ onSuccess: () => utils.planner.bootstrap.invalidate(), onError: e => toast.error(e.message) });
  const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
  const currency = data.settings?.currency ?? "TJS";
  const today = localDayKey();
  const month = today.slice(0, 7);
  const monthTransactions = data.transactions.filter((transaction) => localDayKey(transaction.happenedAt).startsWith(month));
  const monthExpenses = monthTransactions.filter((transaction) => transaction.kind === "expense");
  const monthIncome = monthTransactions.filter((transaction) => transaction.kind === "income");
  const spent = monthExpenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const earned = monthIncome.reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlyLimit = data.settings?.monthlyLimit ?? 0;
  const mandatoryPayments = data.recurringBills.filter(bill => bill.currency === currency && bill.paidThrough !== month).reduce((sum,bill) => sum + bill.amount, 0);
  const remaining = monthlyLimit > 0 ? monthlyLimit - spent - mandatoryPayments - (data.settings?.monthlySavings ?? 0) - (data.settings?.cushion ?? 0) : 0;
  const spentToday = data.transactions.filter((transaction) => transaction.kind === "expense" && localDayKey(transaction.happenedAt) === today).reduce((sum, transaction) => sum + transaction.amount, 0);
  const safeMonthlySpend = safeToSpendToday({ monthlyLimit, spentThisMonth: spent, mandatoryPayments, savingsContributions: data.settings?.monthlySavings ?? 0, cushion: data.settings?.cushion ?? 0, daysRemaining: daysLeftInMonth(today) });
  const safeSpend = monthlyLimit || data.settings?.dailyLimit ? Math.min(monthlyLimit ? safeMonthlySpend : Number.POSITIVE_INFINITY, data.settings?.dailyLimit ? Math.max(0, data.settings.dailyLimit - spentToday) : Number.POSITIVE_INFINITY) : 0;

  const remove = trpc.planner.money.remove.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Операция перемещена в архив"); },
    onError: (error) => toast.error(error.message),
  });

  const chart = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const key = localDayKey(date);
    const expenses = data.transactions.filter((transaction) => transaction.kind === "expense" && localDayKey(transaction.happenedAt) === key).reduce((sum, transaction) => sum + transaction.amount, 0);
    const income = data.transactions.filter((transaction) => transaction.kind === "income" && localDayKey(transaction.happenedAt) === key).reduce((sum, transaction) => sum + transaction.amount, 0);
    return { key, label: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", ""), expenses, income };
  });
  const chartMax = Math.max(1000, ...chart.flatMap((day) => [day.expenses, day.income]));

  const categories = Object.entries(monthExpenses.reduce<Record<string, number>>((result, transaction) => {
    result[transaction.category] = (result[transaction.category] ?? 0) + transaction.amount;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
  const filtered = data.transactions.filter((transaction) => filter === "all" || transaction.kind === filter);

  return (
    <div className="page">
      <div className="page-header">
        <div><p className="eyebrow">Деньги без ежедневной тревоги</p><h1>Деньги</h1><p className="subtitle">Лимиты, реальные операции и спокойный ответ на вопрос: сколько можно потратить сегодня?</p></div>
        <div className="action-row quick-add-desktop"><button className="button button-primary" type="button" onClick={() => openQuickAdd("expense")}><Plus size={17} />Трата</button><button className="button button-ghost" type="button" onClick={() => openQuickAdd("income")}><Plus size={17} />Доход</button></div>
      </div>

      <div className="money-hero">
        <section className="card dark-card">
          <p className="eyebrow" style={{ color: "oklch(0.74 0.02 70)" }}><ShieldCheck size={14} style={{ display: "inline", marginRight: 6 }} />С учётом подушки и оставшихся дней</p>
          <p className="safe-value number">{monthlyLimit > 0 || data.settings?.dailyLimit ? formatMoney(safeSpend, currency) : "Задайте бюджет"}</p>
          <p className="subtitle">безопасно потратить сегодня</p>
          <div className="budget-grid" style={{ marginTop: 24 }}>
            <div className="budget-stat"><strong className="number">{formatMoney(spentToday, currency)}</strong><span>потрачено сегодня</span></div>
            <div className="budget-stat"><strong className="number">{formatMoney(data.settings?.dailyLimit ?? 0, currency)}</strong><span>дневной лимит</span></div>
            <div className="budget-stat"><strong className="number">{formatMoney(Math.max(0, (data.settings?.dailyLimit ?? 0) - spentToday), currency)}</strong><span>осталось по лимиту</span></div>
          </div>
        </section>
        <section className="card">
          <p className="card-label">Месячный бюджет</p>
          <p className="card-value number">{monthlyLimit > 0 ? formatMoney(remaining, currency) : "Не задан"}</p>
          <p className="small muted">{monthlyLimit > 0 ? `с учётом обязательных платежей, накоплений и подушки из ${formatMoney(monthlyLimit, currency)}` : "Укажите месячный бюджет в настройках"}</p>
          {monthlyLimit > 0 && <><div className="progress-track"><div className="progress-fill" style={{ transform: `scaleX(${Math.min(1, spent / Math.max(1, monthlyLimit))})`, background: spent > monthlyLimit ? "var(--danger)" : "var(--accent)" }} /></div><div className="project-stats"><span>Использовано {Math.round(spent / Math.max(1, monthlyLimit) * 100)}%</span><span>{daysLeftInMonth(today)} дн. осталось</span></div></>}
          <div className="plain-list" style={{ marginTop: 12 }}>
            <div className="list-row"><ArrowDownLeft size={18} color="var(--success)" /><div className="list-row-main"><strong>Доходы за месяц</strong></div><span className="list-row-value transaction-amount income">+{formatMoney(earned, currency)}</span></div>
            <div className="list-row"><ArrowUpRight size={18} color="var(--danger)" /><div className="list-row-main"><strong>Расходы за месяц</strong></div><span className="list-row-value transaction-amount expense">−{formatMoney(spent, currency)}</span></div>
          </div>
        </section>
      </div>

      <div style={{ marginTop: 14 }}><RecurringBills data={data} /></div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}><h2>Ожидаемая оплата</h2><span className="badge">{formatMoney((data.pendingTransactions ?? []).filter(t => t.currency === currency).reduce((sum, t) => sum + t.amount, 0), currency)}</span></div>
        <p className="small muted">Эти деньги ещё не получены и не входят в доходы или доступный бюджет. После сдачи проекта отметьте фактическое получение.</p>
        <div className="plain-list">{(data.pendingTransactions ?? []).filter(t => t.currency === currency).map(t => <div className="list-row" key={t.id}>
          <div className="list-row-main"><strong>{t.note || data.projects.find(p => p.id === t.projectId)?.name || t.category}</strong><span>{t.expectedOn ? `Ожидается ${t.expectedOn}` : "После сдачи / по договорённости"}{t.projectId ? ` · ${data.projects.find(p => p.id === t.projectId)?.name ?? "Проект"}` : ""}</span></div>
          <strong className="list-row-value">{formatMoney(t.amount, t.currency)}</strong>
          <button className="button button-primary button-small" disabled={paymentStatus.isPending} onClick={() => paymentStatus.mutate({ id: t.id, status: "posted" })}>Деньги получены</button>
          <button className="icon-button" aria-label="Архивировать ожидаемую оплату" onClick={() => { if (window.confirm("Убрать ожидаемую оплату в архив?")) remove.mutate({ id: t.id }); }}><Trash2 size={15} /></button>
        </div>)}</div>
        {!(data.pendingTransactions ?? []).some(t => t.currency === currency) && <p className="small muted">Ожидаемых оплат пока нет. При добавлении дохода выберите «Ожидаю оплату после сдачи».</p>}
      </section>

      <div className="dashboard-grid" style={{ marginTop: 14 }}>
        <section className="card span-7">
          <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Последние 7 дней</p><h2>Движение денег</h2></div><div className="legend-row"><span className="dot" />Траты <span className="dot" style={{ background: "var(--success)" }} />Доходы</div></div>
          <div className="bar-chart" aria-label="График доходов и расходов за семь дней">
            {chart.map((day) => (
              <div className="bar-column" key={day.key} title={`${day.key}: расходы ${day.expenses}, доходы ${day.income}`}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: "100%", width: "100%" }}>
                  <div className="bar" style={{ height: `${Math.max(3, day.expenses / chartMax * 100)}%` }} />
                  <div className="bar" style={{ height: `${Math.max(3, day.income / chartMax * 100)}%`, background: "var(--success)" }} />
                </div>
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
          <p className="small muted">Итог недели: <strong style={{ color: "var(--danger)" }}>−{formatMoney(chart.reduce((sum, day) => sum + day.expenses, 0), currency)}</strong> · доход <strong style={{ color: "var(--success)" }}>+{formatMoney(chart.reduce((sum, day) => sum + day.income, 0), currency)}</strong></p>
        </section>

        <section className="card span-5">
          <div className="section-title" style={{ marginTop: 0 }}><h2>По категориям</h2><span className="badge">{month}</span></div>
          {categories.length === 0 && <p className="muted small">В этом месяце ещё нет расходов.</p>}
          {categories.slice(0, 6).map(([category, amount]) => (
            <div className="category-row" key={category}>
              <strong className="small">{category}</strong><span className="small number">{formatMoney(amount, currency)}</span>
              <div className="progress-track"><div className="progress-fill" style={{ transform: `scaleX(${amount / Math.max(1, spent)})` }} /></div>
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="section-title" style={{ marginTop: 0 }}><h2>Операции</h2><ReceiptText size={20} color="var(--text-soft)" /></div>
        <div className="segmented" style={{ marginBottom: 8 }}>
          <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
          <button type="button" className={filter === "expense" ? "active" : ""} onClick={() => setFilter("expense")}>Расходы</button>
          <button type="button" className={filter === "income" ? "active" : ""} onClick={() => setFilter("income")}>Доходы</button>
        </div>
        {filtered.length === 0 && <div className="empty-state"><WalletCards size={30} /><strong>Операций пока нет</strong><p>Первая трата вносится за три касания через кнопку ниже.</p></div>}
        <div className="plain-list">
          {filtered.slice(0, 30).map((transaction) => (
            <div className="list-row" key={transaction.id}>
              <span style={{ color: transaction.kind === "expense" ? "var(--danger)" : "var(--success)" }}>{transaction.kind === "expense" ? <ArrowUpRight size={19} /> : <ArrowDownLeft size={19} />}</span>
              <div className="list-row-main"><strong>{transaction.note || transaction.category}</strong><span>{transaction.category} · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(transaction.happenedAt)}</span></div>
              <span className={`list-row-value transaction-amount ${transaction.kind}`}>{transaction.kind === "expense" ? "−" : "+"}{formatMoney(transaction.amount, currency)}</span>
              {transaction.kind === "income" && <button className="text-button" disabled={paymentStatus.isPending} onClick={() => paymentStatus.mutate({ id: transaction.id, status: "pending" })}>Ещё не получено</button>}
              <button className="icon-button" type="button" onClick={() => { if (window.confirm("Архивировать эту операцию?")) remove.mutate({ id: transaction.id }); }} aria-label="Архивировать операцию"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
