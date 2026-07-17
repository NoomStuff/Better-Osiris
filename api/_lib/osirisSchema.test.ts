import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOsirisRosterResponse } from "./osirisSchema.js";

void describe("OSIRIS response schema", () => {
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
