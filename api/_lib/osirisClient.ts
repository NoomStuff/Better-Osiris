import { getEnvValue } from "./env.js";
import crypto from "node:crypto";

const OSIRIS_ROSTER_URL = "https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week";

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
}

const WEEK_CACHE_TTL_MS = 60_000;
const weekCache = new Map<string, { data: OsirisRosterResponse; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<OsirisRosterResponse>>();

function getCacheKey(offset: number, limit: number, bearerToken: string) {
   return `${hashToken(bearerToken)}:${offset}:${limit}`;
}

export async function fetchOsirisRosterWeeks(offset: number, limit = 1, tokenOverride?: string | null): Promise<OsirisRosterResponse> {
   const customToken = normalizeToken(tokenOverride);
   const bearerToken = customToken ?? getEnvValue("BEARER_TOKEN");

   if (!bearerToken) {
      throw new Error("BEARER_TOKEN is missing. Add it to .env before using live OSIRIS data.");
   }

   const safeLimit = Math.max(1, limit);
   const cacheKey = getCacheKey(offset, safeLimit, bearerToken);

   const cachedWeek = weekCache.get(cacheKey);
   if (cachedWeek && cachedWeek.expiresAt > Date.now()) {
      return cachedWeek.data;
   }

   const inFlight = inFlightRequests.get(cacheKey);
   if (inFlight) {
      return inFlight;
   }

   const searchParams = new URLSearchParams({
      limit: String(safeLimit),
      offset: String(offset),
   });

   const request = fetch(`${OSIRIS_ROSTER_URL}?${searchParams.toString()}`, {
      headers: {
         Authorization: bearerToken,
         Accept: "application/json",
      },
   })
      .then(async (response) => {
         if (!response.ok) {
            throw new Error(`OSIRIS request failed with ${response.status}.`);
         }

         const data = (await response.json()) as OsirisRosterResponse;
         weekCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + WEEK_CACHE_TTL_MS,
         });
         return data;
      })
      .finally(() => {
         inFlightRequests.delete(cacheKey);
      });

   inFlightRequests.set(cacheKey, request);
   return request;
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
