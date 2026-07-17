type BrowserStorageName = "localStorage" | "sessionStorage";

export function readBrowserStorage(name: BrowserStorageName, key: string) {
   try {
      return getStorage(name)?.getItem(key) ?? null;
   } catch {
      return null;
   }
}

export function writeBrowserStorage(name: BrowserStorageName, key: string, value: string) {
   try {
      getStorage(name)?.setItem(key, value);
      return true;
   } catch {
      return false;
   }
}

export function removeBrowserStorage(name: BrowserStorageName, key: string) {
   try {
      getStorage(name)?.removeItem(key);
      return true;
   } catch {
      return false;
   }
}

function getStorage(name: BrowserStorageName) {
   return typeof window === "undefined" ? null : window[name];
}
