import assert from "node:assert/strict";
import { it } from "node:test";
import { deliverNotification, isNotificationExpired, runNotificationQueue } from "./notificationDelivery";

void it("expires at the deadline and leaves alerts without an expiry alone", () => {
   assert.equal(isNotificationExpired({ data: { expiresAt: 100 } }, 99), false);
   assert.equal(isNotificationExpired({ data: { expiresAt: 100 } }, 100), true);
   for (const data of [undefined, null, {}, { expiresAt: "100" }]) {
      assert.equal(isNotificationExpired({ data }, 101), false);
   }
});

void it("does not try browser delivery for expired or invalidated work", async () => {
   assert.equal(await deliverNotification("Expired", "expired", () => true, Date.now() - 1), false);
   assert.equal(await deliverNotification("Invalidated", "invalidated", () => false), false);
});

void it("serializes alert kinds and keeps the queue usable after a failed delivery", async () => {
   const order: string[] = [];
   let release: (() => void) | undefined;
   const gate = new Promise<void>((resolve) => {
      release = resolve;
   });
   const first = runNotificationQueue(async () => {
      order.push("first starts");
      await gate;
      order.push("first ends");
   });
   const second = runNotificationQueue(() => {
      order.push("second");
      return Promise.resolve();
   });
   await Promise.resolve();
   assert.deepEqual(order, ["first starts"]);
   release?.();
   await Promise.all([first, second]);
   assert.deepEqual(order, ["first starts", "first ends", "second"]);
   await assert.rejects(runNotificationQueue(() => Promise.reject(new Error("Delivery failed"))));
   await runNotificationQueue(() => {
      order.push("recovered");
      return Promise.resolve();
   });
   assert.equal(order.at(-1), "recovered");
});
