import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, describe, it } from "node:test";
import { buildOsirisTokenCookieHeader } from "../_lib/auth.js";
import { createEncryptedOsirisTokenCookieValue } from "../_lib/osirisTokenCookie.js";
import handler from "./weeks.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OsirisRosterResponse } from "../_lib/osirisClient.js";

interface MockRequestOptions {
   method?: string;
   url: string;
   cookie?: string;
}

class MockResponse {
   statusCode = 200;
   readonly headers = new Map<string, number | string | string[]>();
   body = "";

   setHeader(name: string, value: number | string | string[]) {
      this.headers.set(name.toLowerCase(), value);
      return this;
   }

   end(chunk?: unknown) {
      this.body = typeof chunk === "string" ? chunk : chunk instanceof Buffer ? chunk.toString("utf8") : "";
      return this;
   }
}

const originalFetch = globalThis.fetch;

afterEach(() => {
   globalThis.fetch = originalFetch;
   delete process.env["COOKIE_SECRET"];
   delete process.env["BEARER_TOKEN"];
});

void describe("GET /api/roster/weeks", () => {
   void it("returns normalized roster weeks with the encrypted OSIRIS token cookie", async () => {
      const requests: OsirisRequest[] = [];
      mockOsirisFetch(requests, createOsirisRosterResponse());
      process.env["COOKIE_SECRET"] = "api-secret";
      const token = "Bearer cookie-token";

      const response = await callWeeksHandler({
         url: "/api/roster/weeks?offset=2&limit=9",
         cookie: createTokenCookie(token, process.env["COOKIE_SECRET"]),
      });

      assert.equal(response.statusCode, 200);

      const payload = JSON.parse(response.body) as {
         offset: number;
         limit: number;
         hasMore: boolean;
         weeks: { week: { offset: number; number: number }; lessons: { title: string; teacher: string }[] }[];
      };
      const firstWeek = payload.weeks[0];
      assert.ok(firstWeek);
      const firstLesson = firstWeek.lessons[0];
      assert.ok(firstLesson);

      assert.equal(payload.offset, 2);
      assert.equal(payload.limit, 5);
      assert.equal(payload.hasMore, true);
      assert.equal(firstWeek.week.offset, 2);
      assert.equal(firstLesson.title, "SOURCE_TITLE");
      assert.equal(firstLesson.teacher, "SOURCE_TEACHER");

      assert.equal(requests.length, 1);
      const firstRequest = requests[0];
      assert.ok(firstRequest);
      assert.equal(firstRequest.authorization, token);
      assert.match(firstRequest.url, /offset=2/);
      assert.match(firstRequest.url, /limit=5/);
   });

   void it("falls back to the server token when no cookie is present", async () => {
      const requests: OsirisRequest[] = [];
      mockOsirisFetch(requests, createOsirisRosterResponse());
      process.env["COOKIE_SECRET"] = "custom-token-secret";
      process.env["BEARER_TOKEN"] = "Bearer server-token";

      const response = await callWeeksHandler({ url: "/api/roster/weeks?offset=4&limit=0" });

      assert.equal(response.statusCode, 200);
      const firstRequest = requests[0];
      assert.ok(firstRequest);
      assert.equal(firstRequest.authorization, process.env["BEARER_TOKEN"]);
   });

   void it("uses the encrypted custom OSIRIS token cookie", async () => {
      const requests: OsirisRequest[] = [];
      mockOsirisFetch(requests, createOsirisRosterResponse());
      process.env["COOKIE_SECRET"] = "custom-token-secret";
      process.env["BEARER_TOKEN"] = "Bearer server-token";

      const customToken = "Bearer custom-token";

      const response = await callWeeksHandler({
         url: "/api/roster/weeks?offset=4&limit=0",
         cookie: createTokenCookie(customToken, process.env["COOKIE_SECRET"]),
      });

      assert.equal(response.statusCode, 200);
      const firstRequest = requests[0];
      assert.ok(firstRequest);
      assert.equal(firstRequest.authorization, customToken);
      assert.match(firstRequest.url, /offset=4/);
      assert.match(firstRequest.url, /limit=1/);
   });

   void it("clamps previous-week requests to the current OSIRIS roster endpoint", async () => {
      const requests: OsirisRequest[] = [];
      mockOsirisFetch(requests, createOsirisRosterResponse());
      process.env["COOKIE_SECRET"] = "api-secret";

      const response = await callWeeksHandler({
         url: "/api/roster/weeks?offset=-1&limit=1",
         cookie: createTokenCookie("Bearer roster-token", process.env["COOKIE_SECRET"]),
      });

      assert.equal(response.statusCode, 200);

      const payload = JSON.parse(response.body) as {
         offset: number;
         weeks: {
            source: { mode: string };
            week: { offset: number; number: number; start: string };
            lessons: { title: string }[];
         }[];
      };
      const week = payload.weeks[0];
      assert.ok(week);
      const lesson = week.lessons[0];
      assert.ok(lesson);

      assert.equal(payload.offset, 0);
      assert.equal(week.week.offset, 0);
      assert.equal(week.source.mode, "osiris");
      assert.equal(lesson.title, "SOURCE_TITLE");

      assert.equal(requests.length, 1);
      assert.match(requests[0]?.url ?? "", /rooster\/per_week/);
      assert.match(requests[0]?.url ?? "", /offset=0/);
      assert.match(requests[0]?.url ?? "", /limit=1/);
   });

   void it("asks for a bearer token without calling OSIRIS when none is configured", async () => {
      let osirisWasCalled = false;
      globalThis.fetch = () => {
         osirisWasCalled = true;
         return Promise.resolve(new Response("{}", { status: 200 }));
      };
      process.env["BEARER_TOKEN"] = "";

      const response = await callWeeksHandler({ url: "/api/roster/weeks?offset=1&limit=3" });
      const payload = JSON.parse(response.body) as { error?: string };

      assert.equal(response.statusCode, 401);
      assert.equal(payload.error, "Bearer token is missing. Set one in the app before using live OSIRIS data.");
      assert.equal(osirisWasCalled, false);
   });
});

async function callWeeksHandler(options: MockRequestOptions) {
   const req = createRequest(options);
   const res = new MockResponse();

   await handler(req, res as unknown as ServerResponse);
   return res;
}

function createRequest({ method = "GET", url, cookie }: MockRequestOptions): IncomingMessage {
   const req = Readable.from([]);
   const headers: IncomingMessage["headers"] = {
      host: "example.test",
   };

   if (cookie) {
      headers.cookie = cookie;
   }

   return Object.assign(req, {
      method,
      url,
      headers,
   }) as IncomingMessage;
}

function createTokenCookie(token: string, secret: string) {
   return buildOsirisTokenCookieHeader(createEncryptedOsirisTokenCookieValue(token, secret), false).split(";")[0] ?? "";
}

interface OsirisRequest {
   url: string;
   authorization: string | null;
}

function mockOsirisFetch(requests: OsirisRequest[], response: OsirisRosterResponse) {
   globalThis.fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
         url: getFetchUrl(input),
         authorization: headers.get("authorization"),
      });

      return Promise.resolve(
         new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
         })
      );
   };
}

function getFetchUrl(input: Parameters<typeof fetch>[0]) {
   if (input instanceof Request) {
      return input.url;
   }

   if (input instanceof URL) {
      return input.toString();
   }

   return input;
}

function createOsirisRosterResponse(): OsirisRosterResponse {
   return {
      hasMore: true,
      limit: 5,
      offset: 2,
      count: 1,
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
                        onderwerp: "SOURCE_TITLE - SOURCE_SUBJECT - SOURCE_DESCRIPTION",
                        subonderwerp: "",
                        tijd_vanaf: "9:00",
                        tijd_tm: "10:30",
                        locatie: "SOURCE_ROOM",
                        locatie_adres: "SOURCE_LOCATION",
                        docenten: [{ naam: "SOURCE_TEACHER" }],
                        actueel: "J",
                     },
                  ],
               },
            ],
         },
      ],
   };
}
