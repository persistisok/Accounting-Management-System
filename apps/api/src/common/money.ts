export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function roundMoney(value: number): string {
  return value.toFixed(2);
}
