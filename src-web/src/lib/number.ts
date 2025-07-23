export function clamp(value: number, [min, max]: [number, number]) {
  return Math.min(Math.max(value, min), max);
}
