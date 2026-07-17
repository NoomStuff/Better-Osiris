import type { IncomingMessage } from "node:http";
import { ApiError } from "./errors.js";
import { getEnvValue } from "./env.js";

interface RateLimitEntry {
   count: number;
   resetAt: number;
}

const MAX_TRACKED_CLIENTS = 2_000;
const entries = new Map<string, RateLimitEntry>();

export function enforceRateLimit(req: IncomingMessage, bucket: string, limit: number, windowMs: number) {
   const now = Date.now();
   const key = `${bucket}:${getClientAddress(req)}`;
   const current = entries.get(key);

   if (!current || current.resetAt <= now) {
      entries.delete(key);
      entries.set(key, { count: 1, resetAt: now + windowMs });
      trimEntries(now);
      return;
   }

   current.count += 1;
   if (current.count > limit) {
      throw new ApiError("Too many requests. Please try again later.", {
         code: "INVALID_REQUEST",
         status: 429,
         retryable: true,
      });
   }
}

export function clearRateLimitEntries() {
   entries.clear();
}

function getClientAddress(req: IncomingMessage) {
   const socket: unknown = Reflect.get(req, "socket");
   const remoteAddress =
      socket && typeof socket === "object" && "remoteAddress" in socket && typeof socket.remoteAddress === "string" ? socket.remoteAddress : undefined;

   if (!trustsForwardedAddresses()) {
      return remoteAddress ?? "unknown";
   }

   const forwarded = req.headers["x-forwarded-for"];
   const forwardedValues = (Array.isArray(forwarded) ? forwarded : [forwarded])
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean);

   // Read from the proxy end of the chain so caller-supplied leftmost values
   // cannot rotate the key when one trusted reverse proxy appends the client IP.
   return forwardedValues.at(-1) ?? remoteAddress ?? "unknown";
}

function trustsForwardedAddresses() {
   const isVercel = process.env["VERCEL"] === "1" || Boolean(process.env["VERCEL_ENV"]?.trim());
   return isVercel || getEnvValue("TRUST_PROXY") === "true";
}

function trimEntries(now: number) {
   entries.forEach((entry, key) => {
      if (entry.resetAt <= now) {
         entries.delete(key);
      }
   });

   while (entries.size > MAX_TRACKED_CLIENTS) {
      const oldestKey = entries.keys().next().value;
      if (!oldestKey) {
         break;
      }
      entries.delete(oldestKey);
   }
}
