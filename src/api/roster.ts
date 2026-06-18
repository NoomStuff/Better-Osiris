import type { RosterBatchResponse } from "../types/roster";

function redirectToLogin() {
   if (typeof window === "undefined") {
      return;
   }

   const isOnLogin = window.location.pathname.startsWith("/login");
   if (isOnLogin) {
      return;
   }

   const nextPath = `${window.location.pathname}${window.location.search}`;
   const target = nextPath && nextPath !== "/" ? `/login.html?next=${encodeURIComponent(nextPath)}` : "/login.html";
   window.location.href = target;
}

export async function fetchRosterWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<RosterBatchResponse> {
   const response = await fetch(`/api/roster/weeks?offset=${offset}&limit=${limit}`, signal ? { signal } : undefined);

   if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
         redirectToLogin();
      }

      let message = `Roster request failed with HTTP ${response.status}.`;
      let detail = "";

      try {
         const payload = (await response.json()) as { error?: string };
         if (payload.error) {
            detail = payload.error;
            message = `Roster request failed with HTTP ${response.status}: ${payload.error}`;
         }
      } catch {
         // Keep the default message if the server did not send JSON.
      }

      throw new RosterRequestError(message, response.status, detail);
   }

   return (await response.json()) as RosterBatchResponse;
}

export class RosterRequestError extends Error {
   readonly status: number;
   readonly detail: string;

   constructor(message: string, status: number, detail: string) {
      super(message);
      this.name = "RosterRequestError";
      this.status = status;
      this.detail = detail;
   }

   get isAuthRelated() {
      if (this.status === 401 || this.status === 403) {
         return true;
      }

      const detail = this.detail.toLowerCase();
      return detail.includes("401") || detail.includes("403") || detail.includes("unauthorized") || detail.includes("forbidden");
   }
}
