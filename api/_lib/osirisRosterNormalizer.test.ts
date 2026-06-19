import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRosterWeeksResponse } from "./osirisRosterNormalizer.js";
import type { OsirisRosterResponse } from "./osirisClient.js";

void describe("OSIRIS roster normalizer", () => {
   void it("normalizes stable fixture fields without depending on live roster content", () => {
      const sourceTitle = "SOURCE_TITLE";
      const sourceSubject = "SOURCE_SUBJECT";
      const sourceDescription = "SOURCE_DESCRIPTION";
      const sourceTeacher = "SOURCE_TEACHER";
      const rawResponse = {
         hasMore: true,
         limit: 2,
         offset: 3,
         count: 2,
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
                           id_rooster: "SOURCE_LESSON_ID",
                           datum: "2026-06-16",
                           onderwerp: `${sourceTitle} - ${sourceSubject} - ${sourceDescription}`,
                           subonderwerp: "",
                           tijd_vanaf: "9:00",
                           tijd_tm: "10:30",
                           locatie: "SOURCE_ROOM",
                           locatie_adres: "SOURCE_LOCATION",
                           docenten: [{ naam: sourceTeacher }],
                           actueel: "J",
                        },
                     ],
                  },
               ],
            },
            {
               jaar: 2026,
               week: 26,
               startdatum: "2026-06-22",
               einddatum: "2026-06-28",
               dagen: [],
            },
         ],
      } satisfies OsirisRosterResponse;

      const weeks = normalizeRosterWeeksResponse(rawResponse, 3);
      const firstWeek = weeks[0];
      const secondWeek = weeks[1];
      assert.ok(firstWeek);
      assert.ok(secondWeek);

      const firstLesson = firstWeek.lessons[0];
      assert.ok(firstLesson);

      assert.equal(weeks.length, 2);
      assert.equal(firstWeek.week.offset, 3);
      assert.equal(secondWeek.week.offset, 4);
      assert.equal(firstLesson.title, sourceTitle);
      assert.equal(firstLesson.subject, sourceSubject);
      assert.equal(firstLesson.description, sourceDescription);
      assert.equal(firstLesson.start, "2026-06-16T09:00:00");
      assert.equal(firstLesson.teacher, sourceTeacher);
   });
});
