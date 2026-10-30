import { mysqlTable, varchar, int, text, index } from "drizzle-orm/mysql-core";
import { syncColumns } from "./agency";
const str = (name: string, length = 180) => varchar(name, { length }).notNull();
export const debts = mysqlTable("debts", { ...syncColumns(), direction: str("direction", 16), counterparty: str("counterparty"), amount: int("amount").notNull(), currency: str("currency", 8), borrowedOn: str("borrowed_on", 10), dueOn: varchar("due_on", { length: 10 }), note: text("note").notNull(), status: str("status", 12) }, t => [index("debts_due_status").on(t.dueOn, t.status)]);
export const debtPayments = mysqlTable("debt_payments", { ...syncColumns(), debtId: str("debt_id", 36).references(() => debts.id), amount: int("amount").notNull(), date: str("date", 10), note: text("note").notNull() });
