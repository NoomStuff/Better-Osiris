const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
   const timeoutController = new AbortController();
   const timeoutId = window.setTimeout(() => timeoutController.abort(new DOMException("The request timed out.", "TimeoutError")), timeoutMs);
   const combined = combineSignals(init.signal, timeoutController.signal);

   try {
      return await fetch(input, { ...init, signal: combined.signal });
   } finally {
      window.clearTimeout(timeoutId);
      combined.cleanup();
   }
}

/** Deliberately lenient: error-handling paths may get an empty body or a proxy's HTML error page, and that must not mask the HTTP status. */
export async function tryReadJson(response: Response): Promise<unknown> {
   try {
      const body = await response.text();
      return body.trim() ? (JSON.parse(body) as unknown) : null;
   } catch {
      return null;
   }
}

export async function readJsonResponse(response: Response, requestLabel: string): Promise<unknown> {
   const body = await response.text();
   if (!body.trim()) {
      throw new Error(`${requestLabel} returned an empty response (HTTP ${response.status}). The API server may be unavailable.`);
   }

   try {
      return JSON.parse(body) as unknown;
   } catch (error) {
      throw new Error(`${requestLabel} returned invalid JSON (HTTP ${response.status}).`, { cause: error });
   }
}

function combineSignals(requestSignal: AbortSignal | null | undefined, timeoutSignal: AbortSignal) {
   if (!requestSignal) {
      return { signal: timeoutSignal, cleanup: () => undefined };
   }

   const controller = new AbortController();
   const abort = (signal: AbortSignal) => controller.abort(signal.reason);
   const abortFromRequest = () => abort(requestSignal);
   const abortFromTimeout = () => abort(timeoutSignal);
   if (requestSignal.aborted) {
      abort(requestSignal);
   } else if (timeoutSignal.aborted) {
      abort(timeoutSignal);
   } else {
      requestSignal.addEventListener("abort", abortFromRequest, { once: true });
      timeoutSignal.addEventListener("abort", abortFromTimeout, { once: true });
   }
   return {
      signal: controller.signal,
      cleanup: () => {
         requestSignal.removeEventListener("abort", abortFromRequest);
         timeoutSignal.removeEventListener("abort", abortFromTimeout);
      },
   };
}
