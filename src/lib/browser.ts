export function getBrowserWindow(): Window | null {
   return typeof globalThis.window === "undefined" ? null : globalThis.window;
}

export function getBrowserDocument(): Document | null {
   return typeof globalThis.document === "undefined" ? null : globalThis.document;
}

export function getBrowserStorage(): Storage | null {
   try {
      return getBrowserWindow()?.localStorage ?? null;
   } catch {
      return null;
   }
}

