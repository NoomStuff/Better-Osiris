import { getBrowserWindow } from "../lib/browser";
import type { RosterBatchResponse } from "../types/roster";

function redirectToLogin() {
   const appWindow = getBrowserWindow();
   if (!appWindow) {
      return;
   }

   const isOnLogin = appWindow.location.pathname.startsWith("/login");
   if (isOnLogin) {
      return;
   }

   const nextPath = `${appWindow.location.pathname}${appWindow.location.search}`;
   const target = nextPath && nextPath !== "/" ? `/login.html?next=${encodeURIComponent(nextPath)}` : "/login.html";
   appWindow.location.href = target;
}

export async function fetchRosterWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<RosterBatchResponse> {
   const response = await fetch(`/api/roster/weeks?offset=${offset}&limit=${limit}`, signal ? { signal } : undefined);

   if (!response.ok) {
      if (response.status === 401) {
         redirectToLogin();
      }

      let message = `Roster request failed with HTTP ${response.status}.`;

      try {
         const payload = (await response.json()) as { error?: string };
         if (payload.error) {
            message = `Roster request failed with HTTP ${response.status}: ${payload.error}`;
         }
      } catch {
         // Keep the default message if the server did not send JSON.
      }

      throw new Error(message);
   }

   return (await response.json()) as RosterBatchResponse;
}
