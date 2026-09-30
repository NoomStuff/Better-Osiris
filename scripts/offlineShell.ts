import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Extend the notification worker with a complete, versioned public app shell. */
export function offlineShell(): Plugin {
   return {
      name: "offline-app-shell",
      apply: "build",
      enforce: "post",
      generateBundle(_options, bundle) {
         const worker = readFileSync("public/notifications-sw.js", "utf8");
         const hash = createHash("sha256").update(worker);
         const publicAssets = [
            "/favicon.svg",
            "/manifest.webmanifest",
            "/icon-192.png",
            "/icon-512.png",
            "/icon-maskable-192.png",
            "/icon-maskable-512.png",
            "/apple-touch-icon.png",
         ];
         for (const url of publicAssets) hash.update(url).update(readFileSync(`public${url}`));
         for (const name of Object.keys(bundle).sort()) {
            const file = bundle[name];
            if (file) hash.update(name).update(file.type === "chunk" ? file.code : file.source);
         }
         const urls = [
            "/",
            ...publicAssets,
            ...Object.keys(bundle)
               .filter((name) => name.startsWith("assets/"))
               .map((name) => `/${name}`),
         ];
         const shell = { cache: `osiris-shell-${hash.digest("hex").slice(0, 16)}`, urls };
         this.emitFile({ type: "asset", fileName: "notifications-sw.js", source: `self.offlineShell = ${JSON.stringify(shell)};\n${worker}` });
      },
   };
}
