export function cashBalance(rows: { kind: string; amount: number; currency: string; status?: string; isDeleted?: boolean }[], currency: string) {
  return rows.filter(row => !row.isDeleted && row.status !== "pending" && row.currency === currency).reduce((sum, row) => sum + (row.kind === "income" ? row.amount : -row.amount), 0);
}
