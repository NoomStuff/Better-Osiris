import type { Class, ClassSnapshot, Week } from "../types/weeks";
import { isSameClassDetails, toClassSnapshot } from "./classSnapshot";

export interface SessionClassDiff {
   schoolClass: Class;
   previousClass?: ClassSnapshot;
   status: "added" | "changed" | "cancelled";
}

/** Absolute Monday dates. Offsets are only meaningful at request time. */
export type SessionClassDiffsByWeek = Map<string, Map<string, SessionClassDiff>>;

export function applySessionClassDiffs(week: Week, changes: SessionClassDiffsByWeek): Week {
   const diffs = changes.get(week.week.start);
   if (!diffs?.size) return week;
   const ids = new Set(week.classes.map((item) => item.id));
   return {
      ...week,
      classes: [
         ...week.classes.map((item) => diffs.get(item.id)?.schoolClass ?? item),
         ...[...diffs.values()].filter((diff) => diff.status === "cancelled" && !ids.has(diff.schoolClass.id)).map((diff) => diff.schoolClass),
      ],
   };
}

function same(left: ClassSnapshot, right: ClassSnapshot) {
   return left.status === right.status && isSameClassDetails(left, right);
}

/** Pure reconciliation. Stable IDs establish moves; changed IDs remain separate removals/additions. */
export function reconcileWeeks(previous: ReadonlyMap<string, Week>, incoming: readonly Week[], previousChanges: SessionClassDiffsByWeek) {
   const rawWeeks = new Map(previous);
   const changes: SessionClassDiffsByWeek = new Map([...previousChanges].map(([date, diffs]) => [date, new Map(diffs)]));
   const notifications: SessionClassDiff[] = [];
   const incomingIds = new Set(incoming.flatMap((week) => week.classes.map((item) => item.id)));
   const incomingDates = new Set(incoming.map((week) => week.week.start));
   const previousById = new Map([...previous.values()].flatMap((week) => week.classes.map((item) => [item.id, item] as const)));
   const oldDiffsById = new Map([...changes.values()].flatMap((diffs) => [...diffs]));

   rawWeeks.forEach((week, date) => {
      if (!incomingDates.has(date) && week.classes.some((item) => incomingIds.has(item.id))) {
         rawWeeks.set(date, { ...week, classes: week.classes.filter((item) => !incomingIds.has(item.id)) });
      }
   });
   incoming.forEach((week) => rawWeeks.set(week.week.start, week));
   const nextById = new Map([...rawWeeks.values()].flatMap((week) => week.classes.map((item) => [item.id, item] as const)));
   const forget = (id: string) => changes.forEach((diffs) => diffs.delete(id));
   const remember = (date: string, item: Class, old: ClassSnapshot | undefined, status: SessionClassDiff["status"], notify = true) => {
      const original = oldDiffsById.get(item.id)?.previousClass ?? old;
      let displayed: Class;
      if (status === "added") displayed = { ...toClassSnapshot(item), status };
      else if (status === "cancelled") displayed = { ...toClassSnapshot(item), status, ...(original ? { previous: original } : {}) };
      else {
         if (!original) throw new Error("A changed or removed class requires its original snapshot.");
         displayed = { ...toClassSnapshot(item), status, previous: original };
      }
      const diff: SessionClassDiff = { schoolClass: displayed, status, ...(original ? { previousClass: original } : {}) };
      const weekChanges = changes.get(date) ?? new Map<string, SessionClassDiff>();
      weekChanges.set(item.id, diff);
      changes.set(date, weekChanges);
      if (notify) notifications.push({ ...diff, ...(old ? { previousClass: old } : {}) });
   };

   incoming.forEach((week) => {
      week.classes.forEach((item) => {
         const old = previousById.get(item.id);
         const existing = oldDiffsById.get(item.id);
         const original = existing?.previousClass;
         forget(item.id);
         if (original && same(original, toClassSnapshot(item))) return;
         if (!old) {
            if (original) remember(week.week.start, item, original, item.status === "cancelled" ? "cancelled" : "changed");
            else if (previous.has(week.week.start)) remember(week.week.start, item, undefined, item.status === "cancelled" ? "cancelled" : "added");
            return;
         }
         if (same(toClassSnapshot(old), toClassSnapshot(item))) {
            if (existing) remember(week.week.start, item, original, existing.status, false);
            return;
         }
         const status = item.status === "cancelled" ? "cancelled" : existing?.status === "added" ? "added" : "changed";
         remember(week.week.start, item, toClassSnapshot(old), status);
      });
      previous.get(week.week.start)?.classes.forEach((old) => {
         if (nextById.has(old.id)) return;
         const existing = oldDiffsById.get(old.id);
         forget(old.id);
         if (existing?.status === "added") return;
         // A row that vanished without an explicit upstream cancellation still presents as
         // cancelled; it is held back from notifications until concurrent batches settle.
         remember(week.week.start, old, toClassSnapshot(old), "cancelled", old.status !== "cancelled");
      });
   });
   changes.forEach((diffs, date) => {
      if (!diffs.size) changes.delete(date);
   });
   return { rawWeeks, changes, notifications, weeks: [...rawWeeks.values()].map((week) => applySessionClassDiffs(week, changes)) };
}

export function recordSessionClassDiffs(previous: Week, next: Week, changes: SessionClassDiffsByWeek) {
   const result = reconcileWeeks(new Map([[previous.week.start, previous]]), [next], changes);
   changes.clear();
   result.changes.forEach((diffs, date) => changes.set(date, diffs));
   return result.notifications;
}
