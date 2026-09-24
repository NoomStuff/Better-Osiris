import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/** Rasterize public/favicon.svg into the PNG icons platforms require: iOS ignores SVG
    apple-touch-icons, and Android launchers need a maskable variant that keeps the
    glyph inside the central safe-zone circle. Re-run after changing the logo. */
const TILE_BACKGROUND = "#0e111f";
// The glyph's corners reach ~51% of the tile from center; the maskable safe zone is 40%.
const MASKABLE_ART_SCALE = 0.78;

const variants = [
   { file: "public/apple-touch-icon.png", size: 180, scale: 1 },
   { file: "public/icon-192.png", size: 192, scale: 1 },
   { file: "public/icon-512.png", size: 512, scale: 1 },
   { file: "public/icon-maskable-192.png", size: 192, scale: MASKABLE_ART_SCALE },
   { file: "public/icon-maskable-512.png", size: 512, scale: MASKABLE_ART_SCALE },
];

const svg = readFileSync("public/favicon.svg", "utf8").replace("<svg ", '<svg style="width:100%;height:100%;display:block" ');
const browser = await chromium.launch();
const page = await browser.newPage();

for (const variant of variants) {
   await page.setContent(
      `<!doctype html><body style="margin:0"><div id="tile" style="width:${variant.size}px;height:${variant.size}px;background:${TILE_BACKGROUND};display:grid;place-items:center">` +
         `<div style="width:${variant.size * variant.scale}px;height:${variant.size * variant.scale}px">${svg}</div></div>`
   );
   await page.locator("#tile").screenshot({ path: variant.file });
   console.log(`Wrote ${variant.file} (${variant.size}x${variant.size})`);
}

await browser.close();
