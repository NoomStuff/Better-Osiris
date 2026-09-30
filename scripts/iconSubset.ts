import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Keep the existing icon class API, but ship only SVGs referenced by this app. */
export function iconSubset(): Plugin {
   const id = "virtual:app-icons.css";
   return {
      name: "app-icon-subset",
      resolveId(source) {
         if (source === id) return "\0" + id;
      },
      load(source) {
         if (source !== "\0" + id) return;
         const icons = new Map<string, { style: string; name: string }>();
         const scan = (directory: string) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
               const file = path.join(directory, entry.name);
               if (entry.isDirectory()) scan(file);
               else if (/\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts")) {
                  this.addWatchFile(file);
                  for (const match of readFileSync(file, "utf8").matchAll(/\bfa-(solid|regular)\s+fa-([a-z0-9-]+)/g)) {
                     const [, style, name] = match;
                     if (style && name) icons.set(match[0], { style, name });
                  }
               }
            }
         };
         scan("src");
         const css = [
            "/* Font Awesome Free icons: CC BY 4.0, https://fontawesome.com/license/free */",
            ".fa-solid,.fa-regular{display:inline-block;width:1.25em;height:1em;flex-shrink:0;vertical-align:-.125em;background:currentColor;mask:var(--app-icon) center/contain no-repeat}",
         ];
         for (const { style, name } of icons.values()) {
            const file = path.join("node_modules/@fortawesome/fontawesome-free/svgs", style, `${name}.svg`);
            if (!existsSync(file)) throw new Error(`Unknown icon fa-${style} fa-${name}. Use an explicit Font Awesome SVG name.`);
            const svg = readFileSync(file, "utf8")
               .replace(/<!--[\s\S]*?-->/g, "")
               .trim();
            css.push(`.fa-${style}.fa-${name}{--app-icon:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`);
         }
         return css.join("\n");
      },
   };
}
