import crypto from "node:crypto";
import { getOsirisRosterUrl } from "./osirisConfig.js";

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
   source?: "per_week";
}

const WEEK_CACHE_TTL_MS = 60_000;
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
      throw new Error("Bearer token is missing. Set one in the app before using live OSIRIS data.");
   }

   const safeLimit = Math.max(1, limit);
   const rosterUrl = getOsirisRosterUrl();
   const cacheKey = getCacheKey(rosterUrl, offset, safeLimit, bearerToken);

   const cachedWeek = weekCache.get(cacheKey);
   if (cachedWeek && cachedWeek.expiresAt > Date.now()) {
      return cachedWeek.data;
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
   });

   if (!response.ok) {
      throw new Error(`OSIRIS request failed with ${response.status}.`);
   }

   return {
      ...((await response.json()) as OsirisRosterResponse),
      source: "per_week",
   };
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
