import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOsirisRosterResponse } from "./osirisSchema.js";

void describe("OSIRIS response schema", () => {
   void it("validates seconds instead of accepting impossible clock values", () => {
      const entry = {
         id_rooster: "id",
         datum: "2026-06-16",
         onderwerp: "Title",
         subonderwerp: "",
         tijd_vanaf: "09:00:59",
         tijd_tm: "10:00:00",
         locatie: "",
         locatie_adres: "",
         docenten: [],
         actueel: "J",
      };
      const response = {
         items: [{ jaar: 2026, week: 25, startdatum: "2026-06-15", einddatum: "2026-06-21", dagen: [{ datum: "2026-06-16", rooster: [entry] }] }],
         hasMore: false,
         limit: 1,
         offset: 0,
         count: 1,
      };
      assert.doesNotThrow(() => parseOsirisRosterResponse(response));
      entry.tijd_vanaf = "09:00:60";
      assert.throws(() => parseOsirisRosterResponse(response), /valid 24-hour time/);
      entry.tijd_vanaf = "09:00:00";
      entry.tijd_tm = "10:00:99";
      assert.throws(() => parseOsirisRosterResponse(response), /valid 24-hour time/);
   });
   void it("rejects malformed nested roster entries", () => {
      assert.throws(
         () =>
            parseOsirisRosterResponse({
               items: [{ jaar: 2026, week: 25, startdatum: "2026-06-15", einddatum: "2026-06-21", dagen: [{ datum: "2026-06-16", rooster: [{}] }] }],
               hasMore: false,
               limit: 1,
               offset: 0,
               count: 1,
            }),
         /invalid roster response/
      );
   });

   void it("rejects unknown actueel values", () => {
      assert.throws(
         () =>
            parseOsirisRosterResponse({
               items: [
                  {
                     jaar: 2026,
                     week: 25,
                     startdatum: "2026-06-15",
                     einddatum: "2026-06-21",
                     dagen: [
                        {
                           datum: "2026-06-16",
                           rooster: [
                              {
                                 id_rooster: "id",
                                 datum: "2026-06-16",
                                 onderwerp: "Title",
                                 subonderwerp: "",
                                 tijd_vanaf: "09:00",
                                 tijd_tm: "10:00",
                                 locatie: "A1",
                                 locatie_adres: "Campus",
                                 docenten: [],
                                 actueel: "maybe",
                              },
                           ],
                        },
                     ],
                  },
               ],
               hasMore: false,
               limit: 1,
               offset: 0,
               count: 1,
            }),
         /must be "J" or "N"/
      );
   });
});
