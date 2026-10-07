import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getClassNotificationBodies, notifyClassDiffs } from "./classNotifications.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import type { SessionClassDiff } from "./classDiffs.js";
import type { Class, ClassSnapshot } from "../types/weeks";
import { runNotificationQueue } from "./notificationDelivery";

void describe("roster desktop notification messages", () => {
   beforeEach(() => {
      setRosterTimeZone("Europe/Amsterdam");
   });

   void it("describes a single cancellation with its day and start time", () => {
      const diff = createDiff("cancelled");

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development was cancelled: Tuesday 10:30"]);
   });

   void it("uses the most useful changed field for a single changed schoolClass", () => {
      const diff = createDiff("changed", { room: "C04" }, { room: "B12" });

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development changed: B12 → C04"]);
   });

   void it("describes a newly added schoolClass", () => {
      const schoolClass = createClass({ status: "added" });
      const diff = { schoolClass, status: "added" } satisfies SessionClassDiff;

      assert.deepEqual(getClassNotificationBodies([diff]), ["Web Development was added: Tuesday 10:30"]);
   });

   void it("groups multiple changes by status", () => {
      const diffs = [
         createDiff("cancelled"),
         createDiff("cancelled", { id: "cancelled-2" }),
         createDiff("cancelled", { id: "cancelled-3" }),
         createDiff("changed", { id: "changed-1", room: "C04" }, { id: "changed-1", room: "B12" }),
         createDiff("changed", { id: "changed-2", room: "D05" }, { id: "changed-2", room: "A01" }),
      ];

      assert.deepEqual(getClassNotificationBodies(diffs), ["3 classes were cancelled", "2 classes were changed"]);
   });
});

function createDiff(status: "changed" | "cancelled", classOverrides: Partial<Class> = {}, previousOverrides: Partial<ClassSnapshot> = {}) {
   const schoolClass = createClass(classOverrides);
   const previousClass: ClassSnapshot = {
      ...schoolClass,
      ...previousOverrides,
      status: "scheduled",
   };

   return {
      schoolClass: { ...schoolClass, status, previous: previousClass },
      previousClass,
      status,
   } satisfies SessionClassDiff;
}

function createClass(overrides: Partial<Class> = {}): Class {
   const item = {
      id: "schoolClass",
      title: "Web Development",
      subject: "TypeScript",
      start: "2026-06-16T10:30:00+02:00",
      end: "2026-06-16T12:00:00+02:00",
      teacher: "Teacher",
      room: "B12",
      location: "Main building",
      description: "Class",
      status: "scheduled" as const,
      ...overrides,
   };
   const { previous, ...details } = item;
   if (details.status === "changed") return { ...details, status: details.status, previous: previous ?? { ...details, status: "scheduled" } };
   if (details.status === "cancelled") return { ...details, status: "cancelled", ...(previous ? { previous } : {}) };
   return { ...details, status: details.status };
}

void describe("class notification delivery history", () => {
   let messages: string[];
   let now: number;
   const savedNow = Date.now;
   const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
   beforeEach(() => {
      setRosterTimeZone("Europe/Amsterdam");
      now = Date.parse("2026-06-16T09:45:00+02:00");
      Date.now = () => now;
      messages = [];
      const storage = new Map<string, string>([["roster-class-notifications", "true"]]);
      class TestNotification {
         readonly tag: string;
         close() {
            /* Nothing is displayed by this test double. */
         }
         static permission = "granted";
         constructor(_title: string, options: NotificationOptions) {
            this.tag = options.tag ?? "";
            messages.push(options.body ?? "");
         }
      }
      Object.defineProperty(globalThis, "window", {
         configurable: true,
         value: {
            Notification: TestNotification,
            localStorage: {
               getItem: (key: string) => storage.get(key) ?? null,
               setItem: (key: string, value: string) => storage.set(key, value),
            },
         },
      });
   });
   afterEach(() => {
      Date.now = savedNow;
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else Reflect.deleteProperty(globalThis, "window");
   });
   void it("suppresses additions, changes and cancellations once the class has ended", async () => {
      const end = "2026-06-16T09:45:00";
      await notifyClassDiffs(
         [
            { schoolClass: createClass({ id: "added", status: "added", end }), status: "added" },
            createDiff("changed", { id: "changed", room: "C04", end }),
            createDiff("cancelled", { id: "cancelled", end: "2026-06-15T12:00:00+02:00" }),
         ],
         crypto.randomUUID()
      );
      assert.deepEqual(messages, []);
   });
   void it("excludes finished classes from grouped alerts and still alerts for ongoing classes", async () => {
      await notifyClassDiffs(
         [
            createDiff("cancelled", { id: "past", end: "2026-06-16T09:00:00+02:00" }),
            createDiff("cancelled", { id: "ongoing", start: "2026-06-16T09:00:00+02:00" }),
         ],
         crypto.randomUUID()
      );
      assert.deepEqual(messages, ["Web Development was cancelled: Tuesday 09:00"]);
   });
   void it("discards a change when the class ends while waiting in the delivery queue", async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
         release = resolve;
      });
      const blocking = runNotificationQueue(() => gate);
      const notification = notifyClassDiffs([createDiff("cancelled")], crypto.randomUUID());
      now = Date.parse("2026-06-16T12:00:00+02:00");
      release?.();
      await Promise.all([blocking, notification]);
      assert.deepEqual(messages, []);
   });
   void it("delivers A to B to A to B, but suppresses duplicate observations", async () => {
      const context = crypto.randomUUID();
      const forward = createDiff("changed", { room: "B" }, { room: "A" });
      const back = createDiff("changed", { room: "A" }, { room: "B" });
      await notifyClassDiffs([forward], context);
      await notifyClassDiffs([forward], context);
      await notifyClassDiffs([back], context);
      await notifyClassDiffs([forward], context);
      assert.deepEqual(messages, ["Web Development changed: A → B", "Web Development changed: B → A", "Web Development changed: A → B"]);
   });
   void it("suppresses a round trip before delivery and combines pending edits", async () => {
      const context = crypto.randomUUID();
      await Promise.all([
         notifyClassDiffs([createDiff("changed", { room: "B" }, { room: "A" })], context),
         notifyClassDiffs([createDiff("changed", { room: "A" }, { room: "B" })], context),
      ]);
      assert.deepEqual(messages, []);
      await Promise.all([
         notifyClassDiffs([createDiff("changed", { room: "B" }, { room: "A" })], context),
         notifyClassDiffs([createDiff("changed", { room: "C" }, { room: "B" })], context),
      ]);
      assert.deepEqual(messages, ["Web Development changed: A → C"]);
   });
   void it("only cancels a pending addition after the addition has been delivered", async () => {
      const context = crypto.randomUUID();
      const addition: SessionClassDiff = { schoolClass: createClass({ status: "added" }), status: "added" };
      const cancellation = createDiff("cancelled");
      await Promise.all([notifyClassDiffs([addition], context), notifyClassDiffs([cancellation], context)]);
      assert.deepEqual(messages, []);
      await notifyClassDiffs([addition], context);
      await notifyClassDiffs([cancellation], context);
      assert.deepEqual(messages, ["Web Development was added: Tuesday 10:30", "Web Development was cancelled: Tuesday 10:30"]);
   });
   void it("does not show an alert if the class ends while the notification worker activates", async () => {
      const savedWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
      let release: (() => void) | undefined;
      let activating: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
         activating = resolve;
      });
      const ready = new Promise<unknown>((resolve) => {
         release = () => resolve({ showNotification: () => messages.push("Worker alert") });
      });
      Object.defineProperty(navigator, "serviceWorker", {
         configurable: true,
         value: {
            register: () => {
               activating?.();
               return Promise.resolve({});
            },
            ready,
         },
      });
      try {
         const delivery = notifyClassDiffs([createDiff("cancelled")], crypto.randomUUID());
         await started;
         now = Date.parse("2026-06-16T12:00:00+02:00");
         release?.();
         await delivery;
         assert.deepEqual(messages, []);
      } finally {
         release?.();
         if (savedWorker) Object.defineProperty(navigator, "serviceWorker", savedWorker);
         else Reflect.deleteProperty(navigator, "serviceWorker");
      }
   });
});
