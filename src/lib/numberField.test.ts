import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canStepNumberFieldValue, normalizeNumberFieldValue, parseNumberFieldInput, stepNumberFieldValue } from "./numberField.js";

void describe("number field value rules", () => {
   void it("clamps values into the range", () => {
      const bounds = { min: 1, max: 60 };

      assert.equal(normalizeNumberFieldValue(-4, bounds), 1);
      assert.equal(normalizeNumberFieldValue(30, bounds), 30);
      assert.equal(normalizeNumberFieldValue(900, bounds), 60);
   });

   void it("snaps manual input onto the step grid by default", () => {
      const bounds = { min: 0, max: 10, step: 2.5 };

      assert.equal(normalizeNumberFieldValue(3.4, bounds), 2.5);
      assert.equal(normalizeNumberFieldValue(3.75, bounds), 5);
      assert.equal(normalizeNumberFieldValue(9.9, bounds), 10);
   });

   void it("keeps off-grid values when snapping is disabled", () => {
      const bounds = { min: 0, max: 10, step: 2, snap: false };

      assert.equal(normalizeNumberFieldValue(3.4, bounds), 3.4);
      assert.equal(normalizeNumberFieldValue(10.2, bounds), 10);
   });

   void it("stops at the closest reachable lattice point instead of the raw max", () => {
      const bounds = { min: 0, max: 10, step: 3 };

      assert.equal(normalizeNumberFieldValue(10, bounds), 9);
      assert.equal(normalizeNumberFieldValue(9.9, bounds), 9);
   });

   void it("steps in both directions without float drift", () => {
      const bounds = { min: 0, max: 1, step: 0.1 };

      let value = 0;
      for (let index = 0; index < 7; index += 1) {
         value = stepNumberFieldValue(value, bounds, 1);
      }

      assert.equal(value, 0.7);
      assert.equal(stepNumberFieldValue(value, bounds, -1), 0.6);
   });

   void it("returns the bound value when stepping past it", () => {
      const bounds = { min: 1, max: 60 };

      assert.equal(stepNumberFieldValue(1, bounds, -1), 1);
      assert.equal(stepNumberFieldValue(60, bounds, 1), 60);
      assert.equal(stepNumberFieldValue(59.5, bounds, 1), 60);
   });

   void it("knows when a direction is available", () => {
      const bounds = { min: 0, max: 10, step: 3 };

      assert.equal(canStepNumberFieldValue(0, bounds, -1), false);
      assert.equal(canStepNumberFieldValue(0, bounds, 1), true);
      assert.equal(canStepNumberFieldValue(9, bounds, 1), false);
      assert.equal(canStepNumberFieldValue(9, bounds, -1), true);
   });
});

void describe("number field manual input parsing", () => {
   void it("accepts integers, decimals and comma separators", () => {
      assert.equal(parseNumberFieldInput("42"), 42);
      assert.equal(parseNumberFieldInput(" 7.5 "), 7.5);
      assert.equal(parseNumberFieldInput("7,5"), 7.5);
      assert.equal(parseNumberFieldInput("-3"), -3);
   });

   void it("rejects text, empty input and half-typed numbers", () => {
      assert.equal(parseNumberFieldInput(""), null);
      assert.equal(parseNumberFieldInput("  "), null);
      assert.equal(parseNumberFieldInput("soon"), null);
      assert.equal(parseNumberFieldInput("5 min"), null);
      assert.equal(parseNumberFieldInput("1.2.3"), null);
   });
});

void it("preserves fractional origins, fine steps and unsnapped fractions", () => {
   assert.equal(normalizeNumberFieldValue(1.25, { min: 0.25, max: 4.25, step: 1 }), 1.25);
   assert.equal(stepNumberFieldValue(0.015, { min: 0, max: 1, step: 0.015 }, 1), 0.03);
   assert.equal(stepNumberFieldValue(3.4, { min: 0, max: 10, step: 2, snap: false }, 1), 5.4);
});
