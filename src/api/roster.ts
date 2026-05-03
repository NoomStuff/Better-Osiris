import type { RosterBatchResponse, RosterResponse } from "../types/roster";

export async function fetchRosterWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<RosterBatchResponse> {
   const response = await fetch(`/api/roster/weeks?offset=${offset}&limit=${limit}`, signal ? { signal } : undefined);

   if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
         const isOnLogin = window.location.pathname.startsWith("/login");

         if (!isOnLogin) {
            const nextPath = `${window.location.pathname}${window.location.search}`;
            const target = nextPath && nextPath !== "/" ? `/login.html?next=${encodeURIComponent(nextPath)}` : "/login.html";
            window.location.href = target;
         }
      }

      let message = `Server returned ${response.status}`;

      try {
         const payload = (await response.json()) as { error?: string };
         if (payload.error) {
            message = payload.error;
         }
      } catch {
         // Keep the default message if the server did not send JSON.
      }

      throw new Error(message);
   }

   return (await response.json()) as RosterBatchResponse;
}

export async function fetchRosterWeek(offset: number, signal?: AbortSignal): Promise<RosterResponse> {
   const batch = await fetchRosterWeeks(offset, 1, signal);
   const first = batch.weeks[0];

   if (!first) {
      throw new Error("Roster response did not include a week.");
   }

   return first;
}
