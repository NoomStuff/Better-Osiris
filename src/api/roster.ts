import type { RosterBatchResponse } from "../types/roster";
import { parseApiErrorPayload, parseRosterBatchResponse } from "../../shared/rosterValidation";
import { fetchWithTimeout } from "./fetch";

export async function fetchRosterWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<RosterBatchResponse> {
   const response = await fetchWithTimeout(`/api/roster/weeks?offset=${offset}&limit=${limit}`, signal ? { signal } : undefined);
   const payload = await readJson(response);

   if (!response.ok) {
      let message = `Roster request failed with HTTP ${response.status}.`;
      let detail = "";
      const errorPayload = parseApiErrorPayload(payload);
      if (errorPayload) {
         detail = errorPayload.error;
         message = `Roster request failed with HTTP ${response.status}: ${errorPayload.error}`;
      }

      throw new RosterRequestError(message, response.status, detail, errorPayload?.retryable ?? isRetryableStatus(response.status));
   }

   return parseRosterBatchResponse(payload);
}

export class RosterRequestError extends Error {
   readonly status: number;
   readonly detail: string;
   readonly retryable: boolean;

   constructor(message: string, status: number, detail: string, retryable: boolean) {
      super(message);
      this.name = "RosterRequestError";
      this.status = status;
      this.detail = detail;
      this.retryable = retryable;
   }

   get isAuthRelated() {
      if (this.status === 401 || this.status === 403) {
         return true;
      }

      const detail = this.detail.toLowerCase();
      return detail.includes("401") || detail.includes("403") || detail.includes("unauthorized") || detail.includes("forbidden");
   }
}

async function readJson(response: Response) {
   try {
      return (await response.json()) as unknown;
   } catch {
      return null;
   }
}

function isRetryableStatus(status: number) {
   return status === 408 || status === 429 || status >= 500;
}
