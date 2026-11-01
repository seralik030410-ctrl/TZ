// Isolated UI fixture: no database imports, credentials, proxy or production calls.
// Run npm run build, then node scripts/preview-audit.mjs. All writes are rejected.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import superjson from "superjson";
const root = path.resolve("dist/public");
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date();
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dushanbe", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const base = { ownerId: uid(1), isDeleted: false, createdAt: now, updatedAt: now };
const task = (n, extra = {}) => ({ ...base, id: uid(n), title: "Записать людей", projectId: null, stageId: null, parentId: null, scheduleItemId: null, workspaceId: null, notes: null, due: day, estimateMin: 120, importance: 2, status: "plan", completedAt: null, isMit: false, recurrence: null, flexibility: "flexible", dependsOn: null, plannedStart: null, plannedEnd: null, position: n, ...extra });
const data = {
  user: { id: uid(1), name: "Тестовый профиль" }, workspaces: [], busyBlocks: [], serverTime: now,
  projects: [{ ...base, id: uid(2), workspaceId: null, name: "AZ Plus", type: "money", status: "active", deadline: "2026-11-03", priority: 2, nextStep: "Подготовить аватары", dailyMinutesGoal: 60, weeklyMinutesGoal: 300, expectedIncome: 100000, actualIncome: 0 }],
  stages: [{ ...base, id: uid(3), projectId: uid(2), workspaceId: null, name: "Производство аватаров", position: 0, status: "active", deadline: "2026-11-03" }],
  tasks: [task(10, { scheduleItemId: uid(4), estimateMin: 30 }), ...Array.from({ length: 5 }, (_, i) => task(11 + i, { title: `Записать человека ${i + 1} — имя и свойства для профиля`, parentId: uid(10), scheduleItemId: uid(4) })), task(20, { title: "Делать аватары — подготовить варианты для AZ Plus", projectId: uid(2), stageId: uid(3), due: "2026-11-03" }), task(21, { title: "ДлинноеНазваниеЗадачиБезПробелов".repeat(7).slice(0,240) })],
  schedule: [{ ...base, id: uid(4), title: "Пара — практическое занятие и самостоятельная работа", kind: "class", startMin: 480, endMin: 720, weekdays: "1,2,3,4,5,6,7", weekParity: "all", onDate: null, location: "Аудитория — длинное описание места занятия" }], scheduleExceptions: [],
  scheduledBlocks: [{ ...base, id: uid(30), workspaceId: null, taskId: uid(20), start: new Date(`${day}T13:00:00+05:00`), end: new Date(`${day}T13:30:00+05:00`), status: "planned" }],
  timeLogs: [], activeTimer: null, journal: [],
  transactions: [{ ...base, id: uid(40), projectId: uid(2), kind: "income", amount: 100000, currency: "TJS", category: "Проекты", note: "Оплата AZ Plus", happenedAt: now }, { ...base, id: uid(41), projectId: uid(2), kind: "expense", amount: 25000, currency: "TJS", category: "Проекты", note: "Производство", happenedAt: now }],
  recurringBills: ["Интернет", "Коммунальные услуги", "Аренда квартиры"].map((name, i) => ({ ...base, id: uid(50+i), name, amount: [15000,25000,200000][i], currency: "TJS", dueDay: i+5, category: "Обязательные платежи", paidThrough: null })),
  settings: { ...base, id: uid(1), name: "Тестовый профиль", currency: "TJS", dailyLimit: 100000, monthlyLimit: 2000000, workStartMin: 480, workEndMin: 1320, theme: "light", autoReflow: false, cushion: 100000, monthlySavings: 50000, timezone: "Asia/Dushanbe", agencyEnabled: true, goldEnabled: true, debtsEnabled: true, agencyGoal: 1000000, agencyGoalCurrency: "TJS", taskEpoch: 0 },
};
data.workspaces = [{ id: uid(70), name: "Совместная проверка" }];
data.projects.push({ ...data.projects[0], id: uid(71), name: "Общий проект", workspaceId: uid(70) });
data.pendingTransactions = [{ ...data.transactions[0], id: uid(90), status: "pending", expectedOn: "2026-11-03", amount: 250000, note: "После сдачи аватаров" }];
const queries = { "planner.auth.status": { authenticated: true, user: data.user, workspaces: data.workspaces }, "planner.bootstrap": data, "routines.list": { templates: [], closures: [] }, "sharing.busy": [], "taskArchive.list": [], "taskArchive.preview": { revision: "0".repeat(64), personalCount: 3, blockCount: 1, sharedPreservedCount: 0, routinesPreservedCount: 6, conflicts: [] } };
queries["agency.list"] = { deals: [], payments: [], visas: [], flights: [] };
queries["gold.list"] = { trades: [{ ...base, id: uid(80), date: now.toISOString(), closedAt: now.toISOString(), direction: null, instrument: "XAU/USD", size: null, entry: null, exit: null, result: 2500, commission: 0, currency: "USD", reason: "", state: "not_recorded", comment: "Тестовый быстрый результат", status: "closed", riskPercent: null }], rules: [], overrides: [], transfers: [], balances: [] };
queries["debts.list"] = { debts: [], payments: [] };
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "GET") { res.statusCode = 403; return res.end(JSON.stringify({ error: { json: { message: "Тестовый просмотр: запись отключена" } } })); }
    const paths = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
    const results = paths.map(p => ({ result: { data: superjson.serialize(queries[p] ?? []) } }));
    return res.end(JSON.stringify(url.searchParams.has("batch") ? results : results[0]));
  }
  try {
    const name = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (name !== root && !name.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    const file = path.extname(name) ? name : path.join(root, "index.html");
    let bytes = await readFile(file);
    if (file.endsWith("index.html")) bytes = Buffer.from(bytes.toString().replace("<body>", '<body><div style="padding:5px;text-align:center;background:#ffdf9a;color:#302515;font:12px sans-serif">ТЕСТОВЫЕ ДАННЫЕ · запись отключена</div>'));
    res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream"); res.end(bytes);
  } catch { res.statusCode = 404; res.end("Not found"); }
}).listen(4317, "127.0.0.1", () => console.log("Audit fixture: http://127.0.0.1:4317"));
