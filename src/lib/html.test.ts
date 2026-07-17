import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml } from "./html";

void describe("HTML escaping", () => {
   void it("renders toast messages as text rather than markup", () => {
      assert.equal(escapeHtml(`<img src=x onerror="alert('x')"> & text`), "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt; &amp; text");
   });
});
