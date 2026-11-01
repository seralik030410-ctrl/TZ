export function recordFieldValue(initial: Record<string, unknown> | undefined, key: string, fallback: unknown) {
  return initial && Object.prototype.hasOwnProperty.call(initial, key) ? initial[key] ?? "" : fallback ?? "";
}
