import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getClassNotificationBodies, notifyClassDiffs } from "./classNotifications.js";
import { setRosterTimeZone } from "./rosterTimeZone.js";
import type { SessionClassDiff } from "./classDiffs.js";
import type { Class, ClassSnapshot } from "../types/weeks";

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
   const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
   beforeEach(() => {
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
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else Reflect.deleteProperty(globalThis, "window");
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
});
