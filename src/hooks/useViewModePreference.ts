import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import type { ViewMode } from "../types/roster";

const STORAGE_KEY = "roster-view-mode";
const MOBILE_VIEW_MODE_MEDIA_QUERY = "(max-width: 640px)";

export function useViewModePreference() {
   const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

   useEffect(() => {
      writeBrowserStorage("localStorage", STORAGE_KEY, viewMode);
   }, [viewMode]);

   return [viewMode, setViewMode] as const;
}

function getInitialViewMode(): ViewMode {
   const stored = readBrowserStorage("localStorage", STORAGE_KEY);
   if (stored === "agenda" || stored === "grid") {
      return stored;
   }

   return typeof window !== "undefined" && window.matchMedia(MOBILE_VIEW_MODE_MEDIA_QUERY).matches ? "agenda" : "grid";
}
