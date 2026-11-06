import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canStepNumberFieldValue, normalizeNumberFieldValue, parseNumberFieldInput, stepNumberFieldValue } from "./numberField.js";

const bounds = { min: 1, max: 60 };

void describe("number field value rules", () => {
   void it("rounds manual input and clamps it into the range", () => {
      assert.equal(normalizeNumberFieldValue(-4, bounds), 1);
      assert.equal(normalizeNumberFieldValue(7.5, bounds), 8);
      assert.equal(normalizeNumberFieldValue(900, bounds), 60);
   });

   void it("steps from a rounded draft and stops at the bounds", () => {
      assert.equal(stepNumberFieldValue(2.5, bounds, 1), 4);
      assert.equal(stepNumberFieldValue(1, bounds, -1), 1);
      assert.equal(stepNumberFieldValue(60, bounds, 1), 60);
      assert.equal(canStepNumberFieldValue(1, bounds, -1), false);
      assert.equal(canStepNumberFieldValue(1, bounds, 1), true);
      assert.equal(canStepNumberFieldValue(60, bounds, 1), false);
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
