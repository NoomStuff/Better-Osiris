import { MAX_WEEK_LIMIT, MAX_WEEK_OFFSET, MIN_OSIRIS_WEEK_OFFSET, type RosterBatchResponse } from "../../shared/roster.js";
import { fetchOsirisRosterWeeks } from "./osirisClient.js";
import { normalizeRosterWeeksResponse } from "./osirisRosterNormalizer.js";
import { resolveOsirisBearerToken } from "./osirisTokenSettingsService.js";
import { ApiError } from "./errors.js";

export interface RosterWeeksRequest {
   offset: string | null | undefined;
   limit: string | null | undefined;
   cookieHeader: string | undefined;
}

export function parseRosterWeeksRange(offsetValue: string | null | undefined, limitValue: string | null | undefined) {
   const offset = parseBoundedInt(offsetValue, MIN_OSIRIS_WEEK_OFFSET, MIN_OSIRIS_WEEK_OFFSET, MAX_WEEK_OFFSET);
   const limit = parseBoundedInt(limitValue, MAX_WEEK_LIMIT, 1, MAX_WEEK_LIMIT);

   return {
      offset,
      limit: Math.min(limit, MAX_WEEK_OFFSET - offset + 1),
   };
}

export async function loadRosterWeeks(request: RosterWeeksRequest): Promise<RosterBatchResponse> {
   const { offset, limit } = parseRosterWeeksRange(request.offset, request.limit);
   const rawResponse = await fetchOsirisRosterWeeks(offset, limit, resolveOsirisBearerToken(request.cookieHeader));

   return {
      weeks: normalizeRosterWeeksResponse(rawResponse, offset),
      offset,
      limit,
   };
}

function parseBoundedInt(value: string | null | undefined, fallback: number, min: number, max: number) {
   if (value == null) {
      return fallback;
   }

   if (!/^\d+$/.test(value)) {
      throw invalidRangeError();
   }

   const parsed = Number(value);
   if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw invalidRangeError();
   }

   return parsed;
}

function invalidRangeError() {
   return new ApiError("Roster offset or limit is outside the supported range.", {
      code: "INVALID_REQUEST",
      status: 400,
   });
}
