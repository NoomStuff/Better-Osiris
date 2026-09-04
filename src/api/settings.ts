import type { OsirisTokenSettings } from "../../shared/weeks";
import { parseApiErrorPayload, parseOsirisTokenSettings } from "../../shared/rosterValidation";
import { fetchWithTimeout, readJsonResponse } from "./fetch";

export type { OsirisTokenSettings } from "../../shared/weeks";

export async function fetchOsirisTokenSettings(): Promise<OsirisTokenSettings> {
   const response = await fetchWithTimeout("/api/settings/osiris-token");
   return parseSettingsResponse(response);
}

export async function saveOsirisToken(token: string): Promise<OsirisTokenSettings> {
   const response = await fetchWithTimeout("/api/settings/osiris-token", {
      method: "PUT",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
   });

   return parseSettingsResponse(response);
}

export async function clearOsirisToken(): Promise<OsirisTokenSettings> {
   const response = await fetchWithTimeout("/api/settings/osiris-token", {
      method: "DELETE",
   });

   return parseSettingsResponse(response);
}

async function parseSettingsResponse(response: Response): Promise<OsirisTokenSettings> {
   const payload = await readJsonResponse(response, "Settings API");

   if (!response.ok) {
      const errorPayload = parseApiErrorPayload(payload);
      throw new OsirisTokenSettingsError(
         errorPayload?.error ?? `Settings request failed with HTTP ${response.status}.`,
         response.status,
         errorPayload?.code ?? null,
         errorPayload?.retryable ?? false
      );
   }

   return parseOsirisTokenSettings(payload);
}

export class OsirisTokenSettingsError extends Error {
   readonly status: number;
   readonly code: string | null;
   readonly retryable: boolean;

   constructor(message: string, status: number, code: string | null, retryable: boolean) {
      super(message);
      this.name = "OsirisTokenSettingsError";
      this.status = status;
      this.code = code;
      this.retryable = retryable;
   }

   get isTokenRejected() {
      return this.status === 400 || this.status === 401 || this.status === 403 || this.code === "AUTH_REQUIRED";
   }
}
