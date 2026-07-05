import { MAX_WEEK_LIMIT, MAX_WEEK_OFFSET, MIN_OSIRIS_WEEK_OFFSET, type RosterBatchResponse } from "../../shared/roster.js";
import { fetchOsirisRosterWeeks } from "./osirisClient.js";
import { normalizeRosterWeeksResponse } from "./osirisRosterNormalizer.js";
import { resolveOsirisBearerToken } from "./osirisTokenSettingsService.js";

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
      hasMore: rawResponse.hasMore && offset + limit - 1 < MAX_WEEK_OFFSET,
   };
}

export function getRosterErrorStatus(error: unknown) {
   const message = getRosterErrorMessage(error);
   if (message.startsWith("Bearer token is missing.")) {
      return 401;
   }

   const upstreamStatusMatch = /OSIRIS request failed with (\d{3})\./.exec(message);
   const upstreamStatus = Number(upstreamStatusMatch?.[1]);
   return upstreamStatus === 401 || upstreamStatus === 403 ? upstreamStatus : 502;
}

export function getRosterErrorMessage(error: unknown) {
   return error instanceof Error ? error.message : "Unknown roster fetch error.";
}

function parseBoundedInt(value: string | null | undefined, fallback: number, min: number, max: number) {
   const parsed = value == null ? Number.NaN : Number.parseInt(value, 10);
   return Number.isNaN(parsed) ? fallback : Math.min(Math.max(parsed, min), max);
}
