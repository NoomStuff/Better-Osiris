import type { RosterConfig } from "../../shared/weeks";
import { parseApiErrorPayload, parseRosterConfig } from "../../shared/rosterValidation";
import { fetchWithTimeout, readJsonResponse } from "./fetch";

export async function fetchRosterConfig(signal?: AbortSignal): Promise<RosterConfig> {
   const response = await fetchWithTimeout("/api/roster/config", signal ? { signal } : {});
   const payload = await readJsonResponse(response, "Roster config API");

   if (!response.ok) {
      const errorPayload = parseApiErrorPayload(payload);
      throw new Error(errorPayload?.error ?? `Roster config request failed with HTTP ${response.status}.`);
   }

   return parseRosterConfig(payload);
}
