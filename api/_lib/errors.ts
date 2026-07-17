export type ApiErrorCode =
   | "AUTH_REQUIRED"
   | "CONFIGURATION_ERROR"
   | "INVALID_REQUEST"
   | "PAYLOAD_TOO_LARGE"
   | "UPSTREAM_INVALID_RESPONSE"
   | "UPSTREAM_REQUEST_FAILED"
   | "UPSTREAM_TIMEOUT";

export class ApiError extends Error {
   readonly code: ApiErrorCode;
   readonly status: number;
   readonly retryable: boolean;

   constructor(message: string, options: { code: ApiErrorCode; status: number; retryable?: boolean; cause?: unknown }) {
      super(message, options.cause === undefined ? undefined : { cause: options.cause });
      this.name = "ApiError";
      this.code = options.code;
      this.status = options.status;
      this.retryable = options.retryable ?? false;
   }
}

export function toApiError(error: unknown, fallbackMessage = "The request could not be completed.") {
   if (error instanceof ApiError) {
      return error;
   }

   return new ApiError(fallbackMessage, {
      code: "UPSTREAM_REQUEST_FAILED",
      status: 500,
      cause: error,
   });
}

export function toApiErrorPayload(error: unknown, fallbackMessage?: string) {
   const apiError = toApiError(error, fallbackMessage);
   return {
      error: apiError.message,
      code: apiError.code,
      retryable: apiError.retryable,
   };
}
