import type { OsirisTokenSettings } from "../../shared/osirisTokenSettings";

export type { OsirisTokenSettings } from "../../shared/osirisTokenSettings";

export async function fetchOsirisTokenSettings(): Promise<OsirisTokenSettings> {
   const response = await fetch("/api/settings/osiris-token");
   return parseSettingsResponse(response);
}

export async function saveOsirisToken(token: string): Promise<OsirisTokenSettings> {
   const response = await fetch("/api/settings/osiris-token", {
      method: "PUT",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
   });

   return parseSettingsResponse(response);
}

export async function clearOsirisToken(): Promise<OsirisTokenSettings> {
   const response = await fetch("/api/settings/osiris-token", {
      method: "DELETE",
   });

   return parseSettingsResponse(response);
}

async function parseSettingsResponse(response: Response): Promise<OsirisTokenSettings> {
   const payload = (await response.json()) as { hasCustomToken?: unknown; hasBearerToken?: unknown; error?: string };

   if (!response.ok) {
      throw new Error(payload.error ?? `Settings request failed with HTTP ${response.status}.`);
   }

   return {
      hasCustomToken: payload.hasCustomToken === true,
      hasBearerToken: payload.hasBearerToken === true || payload.hasCustomToken === true,
   };
}
