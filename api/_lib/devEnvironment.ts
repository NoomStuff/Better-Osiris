import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isSecureCookieSecret } from "./osirisConfig.js";

const COOKIE_SECRET_ASSIGNMENT = /^(\s*COOKIE_SECRET\s*=\s*)(.*)$/m;

export async function ensureDevelopmentCookieSecret(envPath = path.resolve(process.cwd(), ".env")) {
   let contents: string;
   try {
      contents = await fs.readFile(envPath, "utf8");
   } catch (error) {
      if (hasFileSystemCode(error, "ENOENT")) {
         throw new Error(`Missing ${envPath}. Copy .env.example to .env before starting the development server.`, { cause: error });
      }
      throw error;
   }

   const assignment = COOKIE_SECRET_ASSIGNMENT.exec(contents);
   const configuredSecret = assignment ? unquote(assignment[2]?.trim() ?? "") : "";
   if (isSecureCookieSecret(configuredSecret)) {
      return false;
   }

   const generatedSecret = crypto.randomBytes(48).toString("base64url");
   const replacement = `${assignment?.[1] ?? "COOKIE_SECRET="}"${generatedSecret}"`;
   const nextContents = assignment
      ? `${contents.slice(0, assignment.index)}${replacement}${contents.slice(assignment.index + assignment[0].length)}`
      : `${contents.trimEnd()}${detectLineEnding(contents)}COOKIE_SECRET="${generatedSecret}"${detectLineEnding(contents)}`;

   await fs.writeFile(envPath, nextContents, { encoding: "utf8", mode: 0o600 });
   return true;
}

function unquote(value: string) {
   if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
   }
   return value;
}

function detectLineEnding(contents: string) {
   return contents.includes("\r\n") ? "\r\n" : "\n";
}

function hasFileSystemCode(error: unknown, code: string): error is NodeJS.ErrnoException {
   return error instanceof Error && "code" in error && error.code === code;
}
