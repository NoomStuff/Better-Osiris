import type { WeekBatch } from "../types/weeks";
import { parseApiErrorPayload, parseWeekBatch } from "../../shared/rosterValidation";
import { fetchWithTimeout, tryReadJson } from "./fetch";

export async function fetchWeeks(offset: number, limit: number, signal?: AbortSignal): Promise<WeekBatch> {
   const response = await fetchWithTimeout(`/api/roster/weeks?offset=${offset}&limit=${limit}`, signal ? { signal } : undefined);
   const payload = await tryReadJson(response);

   if (!response.ok) {
      let message = `Roster request failed with HTTP ${response.status}.`;
      let detail = "";
      const errorPayload = parseApiErrorPayload(payload);
      if (errorPayload) {
         detail = errorPayload.error;
         message = `Roster request failed with HTTP ${response.status}: ${errorPayload.error}`;
      }

      throw new WeekRequestError(message, response.status, detail, errorPayload?.retryable ?? isRetryableStatus(response.status), errorPayload?.code ?? null);
   }

   return parseWeekBatch(payload);
}

export class WeekRequestError extends Error {
   readonly status: number;
   readonly detail: string;
   readonly code: string | null;
   readonly retryable: boolean;

   constructor(message: string, status: number, detail: string, retryable: boolean, code: string | null = null) {
      super(message);
      this.name = "WeekRequestError";
      this.status = status;
      this.detail = detail;
      this.code = code;
      this.retryable = retryable;
   }

   get isAuthRelated() {
      return this.status === 401 || this.status === 403 || this.code === "AUTH_REQUIRED";
   }
}

function isRetryableStatus(status: number) {
   return status === 408 || status === 429 || status >= 500;
}
