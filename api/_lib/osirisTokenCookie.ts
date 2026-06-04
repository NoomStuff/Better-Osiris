import crypto from "node:crypto";
import { OSIRIS_TOKEN_COOKIE_NAME, parseCookie } from "./auth.js";

const TOKEN_PREFIX = "v1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function createEncryptedOsirisTokenCookieValue(token: string, secret: string): string {
   const iv = crypto.randomBytes(IV_LENGTH);
   const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
   const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
   const tag = cipher.getAuthTag();

   return [TOKEN_PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function readOsirisTokenFromCookie(cookieHeader: string | undefined, secret: string): string | null {
   const cookieValue = parseCookie(cookieHeader, OSIRIS_TOKEN_COOKIE_NAME);
   if (!cookieValue) {
      return null;
   }

   try {
      const [prefix, ivValue, tagValue, encryptedValue] = cookieValue.split(".");
      if (prefix !== TOKEN_PREFIX || !ivValue || !tagValue || !encryptedValue) {
         return null;
      }

      const iv = Buffer.from(ivValue, "base64url");
      const tag = Buffer.from(tagValue, "base64url");
      const encrypted = Buffer.from(encryptedValue, "base64url");

      if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
         return null;
      }

      const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
      decipher.setAuthTag(tag);

      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
   } catch {
      return null;
   }
}

export function hasOsirisTokenCookie(cookieHeader: string | undefined): boolean {
   return Boolean(parseCookie(cookieHeader, OSIRIS_TOKEN_COOKIE_NAME));
}

function getEncryptionKey(secret: string): Buffer {
   return crypto.createHash("sha256").update(secret).digest();
}
