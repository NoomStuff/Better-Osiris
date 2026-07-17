import type { OsirisTokenSettings } from "../../shared/roster.js";
import { toApiError, toApiErrorPayload } from "./errors.js";
import { clearOsirisTokenSetting, getOsirisTokenSettings, saveOsirisTokenSetting } from "./osirisTokenSettingsService.js";
import { loadRosterWeeks, type RosterWeeksRequest } from "./rosterWeeksService.js";

export interface ApiRouteResponse<TPayload = unknown> {
   statusCode: number;
   payload: TPayload;
   headers?: Record<string, string | string[]>;
}

export async function getRosterWeeksRoute(request: RosterWeeksRequest): Promise<ApiRouteResponse> {
   try {
      return { statusCode: 200, payload: await loadRosterWeeks(request) };
   } catch (error) {
      return errorResponse(error, "The roster could not be loaded.");
   }
}

export function getTokenSettingsRoute(cookieHeader: string | undefined): ApiRouteResponse<OsirisTokenSettings | ReturnType<typeof toApiErrorPayload>> {
   try {
      return settingsResponse(getOsirisTokenSettings(cookieHeader));
   } catch (error) {
      return errorResponse(error, "Token settings could not be loaded.");
   }
}

export function saveTokenSettingsRoute(rawBody: unknown): ApiRouteResponse<OsirisTokenSettings | ReturnType<typeof toApiErrorPayload>> {
   try {
      const token = readToken(rawBody);
      return settingsResponse(saveOsirisTokenSetting(token));
   } catch (error) {
      return errorResponse(error, "The bearer token could not be saved.");
   }
}

export function clearTokenSettingsRoute(): ApiRouteResponse<OsirisTokenSettings | ReturnType<typeof toApiErrorPayload>> {
   try {
      return settingsResponse(clearOsirisTokenSetting());
   } catch (error) {
      return errorResponse(error, "The bearer token could not be reset.");
   }
}

function settingsResponse(result: ReturnType<typeof getOsirisTokenSettings>): ApiRouteResponse<OsirisTokenSettings> {
   return {
      statusCode: 200,
      payload: result.settings,
      ...(result.cookieHeader ? { headers: { "Set-Cookie": result.cookieHeader } } : {}),
   };
}

function errorResponse(error: unknown, fallbackMessage: string): ApiRouteResponse<ReturnType<typeof toApiErrorPayload>> {
   const apiError = toApiError(error, fallbackMessage);
   return {
      statusCode: apiError.status,
      payload: toApiErrorPayload(apiError),
   };
}

function readToken(body: unknown) {
   if (!body || typeof body !== "object" || Array.isArray(body)) {
      return undefined;
   }
   return (body as Record<string, unknown>)["token"];
}
