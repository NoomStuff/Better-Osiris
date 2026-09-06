import { fetchWeeks } from "../api/weeks";
import { getLocalWeekStartIso } from "./date";
import { shiftCalendarDate, weekDistance } from "../../shared/calendar";
import { MAX_WEEK_OFFSET } from "../../shared/weeks";
import type { Week } from "../types/weeks";
import { applySessionClassDiffs, reconcileWeeks, type SessionClassDiff, type SessionClassDiffsByWeek } from "./classDiffs";
import {
   getClassFetchTimes,
   getFreshIncomingWeeks,
   readWeekCache,
   readSessionClassDiffs,
   storeSessionClassDiffs,
   storeWeekCache,
   type StoredWeek,
} from "./weekPersistence";
import { createWeekEntry, getBatchOffsets, getBatchStart, isSameWeekData, type WeekEntries } from "./weekPolicy";
import { getRosterTimeZone, isRosterTimeZoneKnown, setRosterTimeZone } from "./rosterTimeZone";
import { getSessionEpoch, onSessionInvalidated, refreshSession } from "./sessionStore";
import { clearWeekBrowserCache } from "./weekCache";
import { notifyClassDiffs } from "./classNotifications";
import { notifyError } from "./notyf";
import { toWeekLoadError } from "./weekLoadError";

export interface WeekRepositoryOptions {
   enabled: boolean;
   timeZone: string | null;
   clearCache: boolean;
   contextId: string | null;
   resetKey: number;
}
interface Snapshot {
   entries: WeekEntries;
   lastSuccessfulResetKey: number | null;
   sourceShift: number | null;
}
const REFRESH_MS = 5 * 60_000;

/** Owns asynchronous work and date-keyed raw data. React only subscribes to snapshots. */
export class WeekRepository {
   private snapshot: Snapshot = { entries: {}, lastSuccessfulResetKey: null, sourceShift: null };
   // OSIRIS offset zero can advance before the calendar week ends.
   private sourceShift: number | null = null;
   private sourceFetchedAt = 0;
   private readonly listeners = new Set<() => void>();
   private raw = new Map<string, Week>();
   private stored = new Map<string, StoredWeek>();
   private changes: SessionClassDiffsByWeek = new Map();
   private readonly requests = new Map<number, AbortController>();
   private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
   private generation = 0;
   private activeOffset = 0;
   private anchor = "";
   private timeZone: string | null = null;
   private contextId: string | null = null;
   private enabled = false;
   private resetKey = 0;
   private didNotify = false;
   private successRevision = 0;
   private readonly weekSuccessRevisions = new Map<string, number>();
   private readonly pendingCancellations = new Map<string, SessionClassDiff>();

   constructor() {
      const cache = readWeekCache();
      if (!cache) return;
      if (!isRosterTimeZoneKnown()) setRosterTimeZone(cache.timeZone);
      if (cache.timeZone !== getRosterTimeZone()) return;
      this.anchor = getLocalWeekStartIso(new Date());
      this.contextId = cache.contextId;
      this.timeZone = cache.timeZone;
      this.changes = readSessionClassDiffs(cache.contextId, cache.timeZone);
      cache.weeks.forEach((week) => {
         this.raw.set(week.data.week.start, week.data);
         this.stored.set(week.data.week.start, week);
      });
      const latest = cache.weeks.reduce<StoredWeek | null>((best, week) => (!best || week.fetchedAt > best.fetchedAt ? week : best), null);
      if (latest && getLocalWeekStartIso(new Date(latest.checkedAt)) === this.anchor) {
         this.sourceShift = weekDistance(this.anchor, latest.data.week.start) - latest.data.week.offset;
         this.sourceFetchedAt = latest.fetchedAt;
      }
      this.prune();
      this.publishWeeks(true);
   }

   getSnapshot = () => this.snapshot;
   subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => {
         this.listeners.delete(listener);
      };
   };
   private publish(entries: WeekEntries, successfulKey = this.snapshot.lastSuccessfulResetKey) {
      this.snapshot = { entries, lastSuccessfulResetKey: successfulKey, sourceShift: this.sourceShift };
      this.listeners.forEach((listener) => listener());
   }
   private abort() {
      this.generation += 1;
      this.requests.forEach((controller) => controller.abort());
      this.requests.clear();
      this.retryTimers.forEach(clearTimeout);
      this.retryTimers.clear();
      this.pendingCancellations.clear();
   }
   invalidate = () => {
      this.abort();
      this.raw.clear();
      this.stored.clear();
      this.changes.clear();
      this.weekSuccessRevisions.clear();
      this.contextId = null;
      this.sourceShift = null;
      this.sourceFetchedAt = 0;
      this.enabled = false;
      this.didNotify = false;
      this.publish({}, null);
   };

   configure(options: WeekRepositoryOptions, offset: number) {
      if (options.timeZone && this.timeZone && options.timeZone !== this.timeZone) {
         clearWeekBrowserCache();
         this.invalidate();
      }
      this.timeZone = options.timeZone ?? this.timeZone;
      if (options.clearCache) {
         if (this.contextId || this.raw.size) {
            clearWeekBrowserCache();
            this.invalidate();
         }
      } else if (options.contextId && this.contextId && options.contextId !== this.contextId) {
         clearWeekBrowserCache();
         this.invalidate();
      }
      if (options.resetKey !== this.resetKey) this.abort();
      this.resetKey = options.resetKey;
      this.contextId = options.contextId ?? this.contextId;
      this.activeOffset = offset;
      this.enabled = options.enabled && this.contextId !== null;
      if (!this.enabled) {
         this.abort();
         return;
      }
      this.rollover();
      this.loadActive();
   }

   start = () => {
      const unsubscribe = onSessionInvalidated(this.invalidate);
      const refreshActive = () => {
         if (document.visibilityState !== "visible" || !this.enabled) return;
         this.rollover();
         this.load(0, true, true);
         this.load(getBatchStart(this.activeOffset), true, true);
      };
      const timer = setInterval(refreshActive, REFRESH_MS);
      const calendarTimer = setInterval(() => {
         if (this.enabled && this.rollover()) this.loadActive();
      }, 30_000);
      window.addEventListener("online", refreshActive);
      document.addEventListener("visibilitychange", refreshActive);
      return () => {
         unsubscribe();
         this.abort();
         clearInterval(timer);
         clearInterval(calendarTimer);
         window.removeEventListener("online", refreshActive);
         document.removeEventListener("visibilitychange", refreshActive);
      };
   };

   private rollover() {
      if (!isRosterTimeZoneKnown()) return false;
      const anchor = getLocalWeekStartIso(new Date());
      if (anchor === this.anchor) return false;
      this.abort();
      this.anchor = anchor;
      this.sourceShift = null;
      this.sourceFetchedAt = 0;
      this.snapshot = { entries: {}, lastSuccessfulResetKey: null, sourceShift: null };
      this.prune();
      this.publishWeeks(true);
      this.persist();
      return true;
   }
   private prune() {
      for (const date of this.raw.keys()) {
         const offset = weekDistance(this.anchor, date);
         if (offset < -1 || offset > MAX_WEEK_OFFSET) {
            this.raw.delete(date);
            this.stored.delete(date);
            this.weekSuccessRevisions.delete(date);
         }
      }
      for (const date of this.changes.keys()) if (!this.raw.has(date)) this.changes.delete(date);
   }
   private publishWeeks(hydrated = false, successfulKey = this.snapshot.lastSuccessfulResetKey, fetchedDates: ReadonlySet<string> = new Set()) {
      const entries: WeekEntries = { ...this.snapshot.entries };
      // Existing request/error entries only survive within the same calendar anchor.
      for (const key of Object.keys(entries)) {
         const entry = entries[Number(key)];
         if (entry?.data && entry.data.week.start !== shiftCalendarDate(this.anchor, Number(key) * 7)) Reflect.deleteProperty(entries, key);
      }
      this.raw.forEach((week, date) => {
         const offset = weekDistance(this.anchor, date);
         if (!Number.isInteger(offset) || offset < -1 || offset > MAX_WEEK_OFFSET) return;
         const display = applySessionClassDiffs({ ...week, week: { ...week.week, offset } }, this.changes);
         const previous = entries[offset];
         const data = isSameWeekData(previous?.data, display) ? (previous?.data ?? display) : display;
         entries[offset] = createWeekEntry(data, {
            ...(previous && !fetchedDates.has(date) ? previous : {}),
            data,
            isHydrated: hydrated || (!fetchedDates.has(date) && Boolean(previous?.isHydrated)),
            updatedAt: this.stored.get(date)?.changedAt ?? Date.now(),
         });
      });
      this.publish(entries, successfulKey);
   }
   private persist() {
      if (!this.contextId || !this.anchor || !isRosterTimeZoneKnown()) return;
      const timeZone = getRosterTimeZone();
      storeWeekCache({ contextId: this.contextId, timeZone, weeks: [...this.stored.values()] }, this.anchor);
      storeSessionClassDiffs(this.changes, this.contextId, timeZone);
   }
   private loadActive() {
      const start = getBatchStart(this.activeOffset);
      this.load(start);
      this.load(start < 0 ? 0 : start + 5);
   }
   refresh = () => {
      this.load(getBatchStart(this.activeOffset), true);
   };
   ensureWeek = (offset: number) => {
      const entry = this.snapshot.entries[offset];
      if (!entry?.data && !entry?.isFetching && !entry?.error) this.load(getBatchStart(offset));
   };

   private load(start: number, force = false, passive = false) {
      if (!this.enabled || start < 0 || start > MAX_WEEK_OFFSET || this.requests.has(start)) return;
      const offsets = getBatchOffsets(start);
      const stale = offsets.some((offset) => {
         // A known omission cannot be refreshed; it must not invalidate the returned weeks.
         if (this.sourceShift !== null && offset < this.sourceShift) return false;
         const date = shiftCalendarDate(this.anchor, offset * 7);
         const entry = this.snapshot.entries[offset];
         return !entry?.data || entry.isHydrated || Date.now() - (this.stored.get(date)?.checkedAt ?? 0) >= REFRESH_MS;
      });
      if (!force && !stale) return;
      clearTimeout(this.retryTimers.get(start));
      this.retryTimers.delete(start);
      const entries = { ...this.snapshot.entries };
      offsets.forEach((offset) => {
         const old = entries[offset];
         if (passive && !old?.data) return;
         entries[offset] = createWeekEntry(old?.data ?? null, {
            ...old,
            isFetching: true,
            isHydrated: false,
            retryAt: 0,
            error: old?.data ? null : (old?.error ?? null),
         });
      });
      this.publish(entries);
      const controller = new AbortController();
      this.requests.set(start, controller);
      const generation = this.generation;
      const epoch = getSessionEpoch();
      const anchor = this.anchor;
      const successesAtDispatch = this.successRevision;
      const requestOffset = Math.min(MAX_WEEK_OFFSET, Math.max(0, start - (this.sourceShift ?? 0)));
      const requestLimit = Math.min(offsets.length, MAX_WEEK_OFFSET - requestOffset + 1);
      void fetchWeeks(requestOffset, requestLimit, controller.signal)
         .then((payload) => {
            if (generation !== this.generation || epoch !== getSessionEpoch()) return;
            if (payload.contextId !== this.contextId) {
               void refreshSession();
               return;
            }
            if (payload.timeZone !== getRosterTimeZone()) {
               setRosterTimeZone(payload.timeZone);
               this.abort();
               this.raw.clear();
               this.stored.clear();
               this.changes.clear();
               this.sourceShift = null;
               this.sourceFetchedAt = 0;
               this.anchor = getLocalWeekStartIso(new Date());
               this.publish({});
               this.loadActive();
               return;
            }
            if (anchor !== getLocalWeekStartIso(new Date())) {
               this.rollover();
               this.loadActive();
               return;
            }
            const firstWeek = payload.weeks[0];
            if (payload.offset !== requestOffset || payload.limit !== requestLimit || !firstWeek)
               throw new Error("The server returned a different batch than requested.");
            if (payload.fetchedAt >= this.sourceFetchedAt) {
               this.sourceShift = weekDistance(anchor, firstWeek.week.start) - payload.offset;
               this.sourceFetchedAt = payload.fetchedAt;
            }
            const incomingWeeks = getFreshIncomingWeeks(payload.weeks, payload.fetchedAt, this.stored);
            const incomingDates = new Set(incomingWeeks.map((week) => week.week.start));
            const successRevision = ++this.successRevision;
            incomingDates.forEach((date) => this.weekSuccessRevisions.set(date, successRevision));
            // Clear request placeholders even when the source has moved beyond those dates.
            const settledEntries = { ...this.snapshot.entries };
            offsets.forEach((offset) => {
               const entry = settledEntries[offset];
               if (entry)
                  settledEntries[offset] = createWeekEntry(entry.data, {
                     updatedAt: entry.updatedAt,
                     isOmitted: requestOffset === 0 && offset < (this.sourceShift ?? 0),
                  });
            });
            this.snapshot = { ...this.snapshot, entries: settledEntries };
            const result = reconcileWeeks(this.raw, incomingWeeks, this.changes);
            const checkedAt = Date.now();
            result.rawWeeks.forEach((week, date) => {
               const old = this.stored.get(date);
               const incoming = incomingDates.has(date);
               this.stored.set(date, {
                  data: week,
                  fetchedAt: incoming ? payload.fetchedAt : (old?.fetchedAt ?? payload.fetchedAt),
                  checkedAt: incoming ? checkedAt : (old?.checkedAt ?? checkedAt),
                  changedAt: isSameWeekData(this.raw.get(date), week) ? (old?.changedAt ?? checkedAt) : checkedAt,
                  classFetchTimes: getClassFetchTimes(old, week, payload.fetchedAt, incoming),
               });
            });
            this.raw = result.rawWeeks;
            this.changes = result.changes;
            this.prune();
            this.persist();
            this.didNotify = false;
            this.publishWeeks(
               false,
               start === getBatchStart(this.activeOffset) || payload.weeks.some((week) => week.week.start === shiftCalendarDate(anchor, this.activeOffset * 7))
                  ? this.resetKey
                  : this.snapshot.lastSuccessfulResetKey,
               incomingDates
            );
            const notifications = result.notifications.filter(
               (diff) => diff.schoolClass.start.slice(0, 10) >= this.anchor && diff.schoolClass.start.slice(0, 10) <= shiftCalendarDate(this.anchor, 6)
            );
            // Cancellations wait until every in-flight batch has settled: a row that vanished in
            // one response may reappear via a concurrent one, and only the surviving diff notifies.
            notifications.filter((diff) => diff.status === "cancelled").forEach((diff) => this.pendingCancellations.set(diff.schoolClass.id, diff));
            void notifyClassDiffs(
               notifications.filter((diff) => diff.status !== "cancelled"),
               this.contextId
            );
         })
         .catch((error: unknown) => {
            if (controller.signal.aborted || generation !== this.generation || epoch !== getSessionEpoch()) return;
            const loadError = toWeekLoadError(error);
            const entries = { ...this.snapshot.entries };
            const failedOffsets = [
               ...new Set([...offsets, ...Array.from({ length: requestLimit }, (_, index) => requestOffset + (this.sourceShift ?? 0) + index)]),
            ].filter(
               (offset) =>
                  offset >= -1 &&
                  offset <= MAX_WEEK_OFFSET &&
                  (this.weekSuccessRevisions.get(shiftCalendarDate(anchor, offset * 7)) ?? 0) <= successesAtDispatch
            );
            const delay =
               loadError.retryable && !passive && failedOffsets.length > 0
                  ? Math.max(
                       loadError.retryAfterMs ?? 0,
                       Math.min(Math.max(...failedOffsets.map((offset) => entries[offset]?.retryDelayMs ?? 0), 1000) * 2, REFRESH_MS)
                    )
                  : 0;
            failedOffsets.forEach((offset) => {
               const old = entries[offset];
               if (passive && !old?.data) return;
               entries[offset] = createWeekEntry(old?.data ?? null, {
                  error: loadError,
                  updatedAt: old?.updatedAt ?? 0,
                  retryDelayMs: delay,
                  retryAt: delay ? Date.now() + delay : 0,
               });
            });
            this.publish(entries);
            if (!passive && failedOffsets.includes(this.activeOffset) && !this.didNotify) {
               this.didNotify = true;
               notifyError("Something went wrong while loading the roster.");
            }
            if (delay)
               this.retryTimers.set(
                  start,
                  setTimeout(() => {
                     this.retryTimers.delete(start);
                     this.load(start, true);
                  }, delay)
               );
         })
         .finally(() => {
            if (this.requests.get(start) === controller) this.requests.delete(start);
            if (generation === this.generation && this.requests.size === 0 && this.contextId) {
               const cancellations = [...this.pendingCancellations.values()].filter((diff) =>
                  [...this.changes.values()].some((changes) => changes.get(diff.schoolClass.id)?.status === "cancelled")
               );
               this.pendingCancellations.clear();
               void notifyClassDiffs(cancellations, this.contextId);
            }
            // A source rollover can shift a response beyond the selected batch's first date.
            // Fetch that date with the corrected mapping, without changing the selected week.
            const active = this.snapshot.entries[this.activeOffset];
            if (
               generation === this.generation &&
               this.sourceShift !== null &&
               this.activeOffset >= Math.max(0, this.sourceShift) &&
               this.activeOffset <= MAX_WEEK_OFFSET + this.sourceShift &&
               !active?.data &&
               !active?.error &&
               !active?.isFetching
            )
               this.load(getBatchStart(this.activeOffset));
         });
   }
}
