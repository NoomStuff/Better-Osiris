const AUTH_COOKIE_NAME = "auth";
const LOGIN_PATH = "/login.html";
const LOGIN_API_PATH = "/api/login";

export const config = {
   matcher: ["/((?!api/login|api/auth/status|login|login.html).*)"],
};

let cachedKey: CryptoKey | null = null;
let cachedSecret = "";

export async function middleware(request: Request) {
   const url = new URL(request.url);
   const { pathname } = url;

   if (pathname === LOGIN_PATH || pathname.startsWith("/login")) {
      return;
   }

   if (pathname === LOGIN_API_PATH) {
      return;
   }

   const cookieSecret = process.env["COOKIE_SECRET"];
   if (!cookieSecret) {
      return redirectToLogin(url);
   }

   const authCookie = parseCookie(request.headers.get("cookie"), AUTH_COOKIE_NAME);
   if (!authCookie) {
      return redirectToLogin(url);
   }

   const isValid = await isValidAuthCookieValue(authCookie, cookieSecret);
   if (!isValid) {
      return redirectToLogin(url);
   }
}

function redirectToLogin(url: URL): Response {
   const loginUrl = new URL(LOGIN_PATH, url.origin);
   const nextPath = `${url.pathname}${url.search}`;

   if (nextPath && nextPath !== "/") {
      loginUrl.searchParams.set("next", nextPath);
   }

   return Response.redirect(loginUrl, 302);
}

function parseCookie(header: string | null, name: string): string | null {
   if (!header) {
      return null;
   }

   const parts = header.split(";");
   for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {
         continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
         continue;
      }

      const cookieName = trimmed.slice(0, separatorIndex).trim();
      if (cookieName !== name) {
         continue;
      }

      return trimmed.slice(separatorIndex + 1);
   }

   return null;
}

async function isValidAuthCookieValue(cookieValue: string, secret: string): Promise<boolean> {
   const [value, signature] = cookieValue.split(".");

   if (!value || !signature) {
      return false;
   }

   const expectedSignature = await signValue(value, secret);
   return signature === expectedSignature;
}

async function signValue(value: string, secret: string): Promise<string> {
   const key = await getSigningKey(secret);
   const encoder = new TextEncoder();
   const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
   return base64UrlEncode(new Uint8Array(signature));
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
   if (cachedKey && cachedSecret === secret) {
      return cachedKey;
   }

   cachedSecret = secret;
   const encoder = new TextEncoder();
   cachedKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

   return cachedKey;
}

function base64UrlEncode(bytes: Uint8Array): string {
   let binary = "";
   bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
   });

   return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
