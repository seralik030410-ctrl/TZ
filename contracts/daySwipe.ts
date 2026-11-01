export function daySwipe(dx: number, dy: number, duration: number): number {
  if (duration > 800 || duration < 0 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
