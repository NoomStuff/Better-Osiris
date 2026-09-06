import { createHmac } from "node:crypto";
import { getCookieSecret, getOsirisRosterUrl, getRosterTimeZone } from "./osirisConfig.js";

/** Opaque namespace, never a bearer credential or an unkeyed token fingerprint. */
export function getCredentialContext(token: string | null): string | null {
   if (!token) return null;
   return createHmac("sha256", getCookieSecret())
      .update(JSON.stringify(["roster-context-v1", getOsirisRosterUrl(), getRosterTimeZone(), token]))
      .digest("base64url");
}
