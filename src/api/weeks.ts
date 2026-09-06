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

      throw new WeekRequestError(
         message,
         response.status,
         detail,
         errorPayload?.retryable ?? isRetryableStatus(response.status),
         errorPayload?.code ?? null,
         readRetryAfter(response.headers.get("Retry-After"))
      );
   }

   return parseWeekBatch(payload);
}

export class WeekRequestError extends Error {
   readonly status: number;
   readonly detail: string;
   readonly code: string | null;
   readonly retryable: boolean;
   readonly retryAfterMs: number;

   constructor(message: string, status: number, detail: string, retryable: boolean, code: string | null = null, retryAfterMs = 0) {
      super(message);
      this.name = "WeekRequestError";
      this.status = status;
      this.detail = detail;
      this.code = code;
      this.retryable = retryable;
      this.retryAfterMs = retryAfterMs;
   }

   get isAuthRelated() {
      return this.status === 401 || this.status === 403 || this.code === "AUTH_REQUIRED";
   }
}

function isRetryableStatus(status: number) {
   return status === 408 || status === 429 || status >= 500;
}

export function readRetryAfter(value: string | null): number {
   if (!value) return 0;
   const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
   return Number.isFinite(delay) ? Math.min(Math.max(delay, 0), 24 * 60 * 60_000) : 0;
}
