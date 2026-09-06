import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { WeekRepository } from "./weekRepository";
import { getLocalWeekStartIso } from "./date";
import { setRosterTimeZone } from "./rosterTimeZone";
import { isoWeekNumber, shiftCalendarDate } from "../../shared/calendar";
import type { WeekBatch } from "../types/weeks";

const originalFetch = globalThis.fetch;
const pending = new Map<number, (response: Response) => void>();
let repository: WeekRepository;
let anchor = "";
function batch(offset: number, shift: number, limit = 5): WeekBatch {
   return {
      offset,
      limit,
      contextId: "test",
      timeZone: "Europe/Amsterdam",
      fetchedAt: Date.now(),
      weeks: Array.from({ length: limit }, (_, index) => {
         const start = shiftCalendarDate(anchor, (offset + shift + index) * 7);
         return { week: { offset: offset + index, start, end: shiftCalendarDate(start, 6), number: isoWeekNumber(start) }, classes: [] };
      }),
   };
}
async function until(predicate: () => boolean) {
   for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
   }
   assert.ok(predicate(), "Expected repository state was not published");
}
function respond(offset: number, response: Response) {
   const resolve = pending.get(offset);
   assert.ok(resolve, `No request for offset ${offset}`);
   pending.delete(offset);
   resolve(response);
}
void describe("concurrent week requests", () => {
   beforeEach(() => {
      const items = new Map<string, string>();
      const storage = {
         getItem: (key: string) => items.get(key) ?? null,
         setItem: (key: string, value: string) => {
            items.set(key, value);
         },
         removeItem: (key: string) => {
            items.delete(key);
         },
      };
      (globalThis as { window?: unknown }).window = { localStorage: storage, sessionStorage: storage, setTimeout, clearTimeout };
      setRosterTimeZone("Europe/Amsterdam");
      anchor = getLocalWeekStartIso(new Date());
      globalThis.fetch = (input: RequestInfo | URL) => {
         const url = new URL(input instanceof Request ? input.url : input, "http://localhost");
         const offset = Number(url.searchParams.get("offset"));
         return new Promise<Response>((resolve) => {
            pending.set(offset, resolve);
         });
      };
      repository = new WeekRepository();
   });
   afterEach(() => {
      repository.invalidate();
      pending.clear();
      globalThis.fetch = originalFetch;
      delete (globalThis as { window?: unknown }).window;
   });
   const configure = (offset: number) =>
      repository.configure({ enabled: true, clearCache: false, contextId: "test", resetKey: 0, timeZone: "Europe/Amsterdam" }, offset);

   void it("does not refetch fresh source weeks because an earlier calendar week was omitted", async () => {
      configure(0);
      respond(0, Response.json(batch(0, 1)));
      respond(5, Response.json(batch(5, 1)));
      await until(() => Boolean(repository.getSnapshot().entries[6]?.data));
      configure(1);
      assert.equal(pending.has(0), false);
      configure(2);
      assert.equal(pending.has(0), false);
   });

   void it("does not stamp an overlapping failure on a week refreshed by another request", async () => {
      configure(0);
      respond(0, Response.json(batch(0, 1)));
      respond(5, Response.json(batch(5, 1)));
      await until(() => Boolean(repository.getSnapshot().entries[6]?.data));
      repository.refresh();
      configure(5);
      repository.refresh();
      respond(4, Response.json(batch(4, 1)));
      await until(() => Boolean(repository.getSnapshot().entries[5]?.data) && !repository.getSnapshot().entries[5]?.isFetching);
      respond(0, Response.json({ error: "Failed old request" }, { status: 400 }));
      await until(() => Boolean(repository.getSnapshot().entries[1]?.error));
      assert.equal(repository.getSnapshot().entries[5]?.error, null);
      assert.ok(repository.getSnapshot().entries[5]?.data);
   });
   void it("keeps failure entries in range when the source mapping changes in flight", async () => {
      configure(50);
      repository.ensureWeek(0);
      respond(0, Response.json(batch(0, 1)));
      await until(() => repository.getSnapshot().sourceShift === 1);
      respond(50, Response.json({ error: "Failed last request" }, { status: 400 }));
      await until(() => Boolean(repository.getSnapshot().entries[50]?.error));
      assert.equal(repository.getSnapshot().entries[51], undefined);
   });

   void it("waits for concurrent batches before notifying a removal and still notifies confirmed removals", async () => {
      const deliveries: string[] = [];
      function TestNotification(_title: string, options: { body: string }) {
         deliveries.push(options.body);
      }
      Object.defineProperty(TestNotification, "permission", { value: "granted" });
      Object.defineProperty(window, "Notification", { value: TestNotification });
      window.localStorage.setItem("roster-class-notifications", "true");
      const current = batch(0, 0);
      const currentWeek = current.weeks[0];
      assert.ok(currentWeek);
      const day = shiftCalendarDate(anchor, 1);
      const moving = {
         id: "moving",
         title: "Moving class",
         subject: "",
         teacher: "",
         room: "",
         location: "",
         description: "",
         start: `${day}T09:00:00`,
         end: `${day}T10:00:00`,
         status: "scheduled" as const,
      };
      const staying = { ...moving, id: "staying", title: "Staying class" };
      currentWeek.classes = [moving, staying];
      configure(0);
      respond(0, Response.json(current));
      respond(5, Response.json(batch(5, 0)));
      await until(() => Boolean(repository.getSnapshot().entries[5]?.data));
      configure(5);
      respond(10, Response.json(batch(10, 0)));
      await until(() => Boolean(repository.getSnapshot().entries[10]?.data));
      configure(0);
      repository.refresh();
      configure(5);
      repository.refresh();
      const changed = batch(0, 0);
      assert.ok(changed.weeks[0]);
      changed.weeks[0].classes = [staying];
      respond(0, Response.json(changed));
      await until(() => repository.getSnapshot().entries[0]?.data?.classes.some((item) => item.status === "cancelled") === true);
      assert.deepEqual(deliveries, []);
      const destination = batch(5, 0);
      const movedWeek = destination.weeks[1];
      assert.ok(movedWeek);
      const movedDay = shiftCalendarDate(movedWeek.week.start, 1);
      movedWeek.classes = [{ ...moving, start: `${movedDay}T09:00:00`, end: `${movedDay}T10:00:00` }];
      respond(5, Response.json(destination));
      await until(() => repository.getSnapshot().entries[6]?.data?.classes.some((item) => item.id === "moving") === true);
      assert.deepEqual(deliveries, []);
      configure(0);
      repository.refresh();
      respond(0, Response.json(batch(0, 0)));
      await until(() => deliveries.length > 0);
      assert.deepEqual(deliveries, ["Staying class was cancelled: Tuesday 09:00"]);
   });
});
