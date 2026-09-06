export function shiftCalendarDate(date: string, days: number): string {
   const value = new Date(`${date}T00:00:00Z`);
   value.setUTCDate(value.getUTCDate() + days);
   return value.toISOString().slice(0, 10);
}

export function isoWeekNumber(date: string): number {
   const value = new Date(`${date}T00:00:00Z`);
   value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
   return Math.ceil(((value.getTime() - Date.UTC(value.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

export function weekDistance(from: string, to: string): number {
   return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 86_400_000);
}
