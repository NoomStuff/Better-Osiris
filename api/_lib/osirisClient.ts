import crypto from "node:crypto";
import { ApiError } from "./errors.js";
import { getOsirisRosterUrl } from "./osirisConfig.js";
import { parseOsirisRosterResponse } from "./osirisSchema.js";

export interface OsirisTeacher {
   naam: string;
}

export interface OsirisRosterEntry {
   id_rooster: string;
   datum: string;
   onderwerp: string;
   subonderwerp: string;
   tijd_vanaf: string;
   tijd_tm: string;
   locatie: string;
   locatie_adres: string;
   docenten: OsirisTeacher[];
   actueel: "J" | "N";
   status?: string;
   roosterstatus?: string;
   status_omschrijving?: string;
   statusomschrijving?: string;
}

export interface OsirisDay {
   datum: string;
   rooster: OsirisRosterEntry[];
}

export interface OsirisWeek {
   jaar: number;
   week: number;
   startdatum: string;
   einddatum: string;
   dagen: OsirisDay[];
}

export interface OsirisRosterResponse {
   items: OsirisWeek[];
   hasMore: boolean;
   limit: number;
   offset: number;
   count: number;
   source?: "per_week";
}

const WEEK_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const weekCache = new Map<string, { data: OsirisRosterResponse; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<OsirisRosterResponse>>();

export function clearOsirisRosterCache() {
   weekCache.clear();
   inFlightRequests.clear();
}

function getCacheKey(rosterUrl: string, offset: number, limit: number, bearerToken: string) {
   return `${rosterUrl}:${hashToken(bearerToken)}:${offset}:${limit}`;
}

export async function fetchOsirisRosterWeeks(offset: number, limit = 1, tokenOverride?: string | null): Promise<OsirisRosterResponse> {
   const bearerToken = normalizeToken(tokenOverride);

   if (!bearerToken) {
      clearOsirisRosterCache();
      throw new ApiError("Bearer token is missing. Set one in the app before using live OSIRIS data.", {
         code: "AUTH_REQUIRED",
         status: 401,
      });
   }

   const safeLimit = Math.max(1, limit);
   const rosterUrl = getOsirisRosterUrl();
   const cacheKey = getCacheKey(rosterUrl, offset, safeLimit, bearerToken);

   const cachedWeek = weekCache.get(cacheKey);
   if (cachedWeek && cachedWeek.expiresAt > Date.now()) {
      weekCache.delete(cacheKey);
      weekCache.set(cacheKey, cachedWeek);
      return cachedWeek.data;
   }
   if (cachedWeek) {
      weekCache.delete(cacheKey);
   }

   const inFlight = inFlightRequests.get(cacheKey);
   if (inFlight) {
      return inFlight;
   }

   const request = fetchOsirisRosterRange(rosterUrl, offset, safeLimit, bearerToken)
      .then((data) => {
         weekCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + WEEK_CACHE_TTL_MS,
         });
         trimWeekCache();
         return data;
      })
      .finally(() => {
         inFlightRequests.delete(cacheKey);
      });

   inFlightRequests.set(cacheKey, request);
   return request;
}

async function fetchOsirisRosterRange(rosterUrl: string, offset: number, limit: number, bearerToken: string): Promise<OsirisRosterResponse> {
   if (offset < 0) {
      throw new Error("OSIRIS does not expose previous roster weeks.");
   }

   return fetchOsirisRosterWeeksFromEndpoint(rosterUrl, offset, limit, bearerToken);
}

async function fetchOsirisRosterWeeksFromEndpoint(rosterUrl: string, offset: number, limit: number, bearerToken: string): Promise<OsirisRosterResponse> {
   const searchParams = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
   });

   const response = await fetch(`${rosterUrl}?${searchParams.toString()}`, {
      headers: {
         Authorization: bearerToken,
         Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
   }).catch((error: unknown) => {
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ApiError(isTimeout ? "OSIRIS took too long to respond." : "OSIRIS could not be reached.", {
         code: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_REQUEST_FAILED",
         status: 502,
         retryable: true,
         cause: error,
      });
   });

   if (!response.ok) {
      throw new ApiError(`OSIRIS request failed with ${response.status}.`, {
         code: "UPSTREAM_REQUEST_FAILED",
         status: response.status === 401 || response.status === 403 ? response.status : 502,
         retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
   }

   const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
   if (!contentType.includes("application/json")) {
      throw new ApiError("OSIRIS returned a non-JSON roster response.", {
         code: "UPSTREAM_INVALID_RESPONSE",
         status: 502,
      });
   }

   return parseOsirisRosterResponse(await readLimitedJson(response));
}

async function readLimitedJson(response: Response) {
   const declaredLength = Number(response.headers.get("content-length"));
   if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw responseTooLargeError();
   }

   const reader = response.body?.getReader();
   if (!reader) {
      throw new ApiError("OSIRIS returned an empty roster response.", {
         code: "UPSTREAM_INVALID_RESPONSE",
         status: 502,
      });
   }

   const chunks: Uint8Array[] = [];
   let byteLength = 0;
   for (;;) {
      const result = await (async () => {
         try {
            return await reader.read();
         } catch (error) {
            throw new ApiError("OSIRIS disconnected while sending roster data.", {
               code: "UPSTREAM_REQUEST_FAILED",
               status: 502,
               retryable: true,
               cause: error,
            });
         }
      })();

      const { done, value } = result;
      if (done) {
         break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
         await reader.cancel();
         throw responseTooLargeError();
      }
      chunks.push(value);
   }

   const body = Buffer.concat(chunks).toString("utf8");
   try {
      return JSON.parse(body) as unknown;
   } catch {
      throw new ApiError("OSIRIS returned malformed JSON.", {
         code: "UPSTREAM_INVALID_RESPONSE",
         status: 502,
      });
   }
}

function responseTooLargeError() {
   return new ApiError("OSIRIS returned an unexpectedly large roster response.", {
      code: "UPSTREAM_INVALID_RESPONSE",
      status: 502,
   });
}

function trimWeekCache() {
   const now = Date.now();
   weekCache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
         weekCache.delete(key);
      }
   });

   while (weekCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = weekCache.keys().next().value;
      if (!oldestKey) {
         break;
      }
      weekCache.delete(oldestKey);
   }
}

function hashToken(token: string): string {
   return crypto.createHash("sha256").update(token).digest("base64url").slice(0, 24);
}

function normalizeToken(token: string | null | undefined): string | undefined {
   const trimmed = token?.trim();
   if (trimmed) {
      return trimmed;
   }

   return undefined;
}
