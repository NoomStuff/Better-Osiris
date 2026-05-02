import { getEnvValue } from "./env.js";

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
const weekCache = new Map<number, { data: OsirisRosterResponse; expiresAt: number }>();
const inFlightRequests = new Map<number, Promise<OsirisRosterResponse>>();

export async function fetchOsirisRosterWeek(offset: number): Promise<OsirisRosterResponse> {
   const bearerToken = getEnvValue("BEARER_TOKEN");

   if (!bearerToken) {
      throw new Error("BEARER_TOKEN is missing. Add it to .env before using live OSIRIS data.");
   }

   const cachedWeek = weekCache.get(offset);
   if (cachedWeek && cachedWeek.expiresAt > Date.now()) {
      return cachedWeek.data;
   }

   const inFlight = inFlightRequests.get(offset);
   if (inFlight) {
      return inFlight;
   }

   const searchParams = new URLSearchParams({
      limit: "1",
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
         weekCache.set(offset, {
            data,
            expiresAt: Date.now() + WEEK_CACHE_TTL_MS,
         });
         return data;
      })
      .finally(() => {
         inFlightRequests.delete(offset);
      });

   inFlightRequests.set(offset, request);
   return request;
}
