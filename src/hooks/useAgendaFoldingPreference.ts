import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type AgendaFoldingMode = "single" | "smart" | "all";

const STORAGE_KEY = "roster-agenda-folding";
const DEFAULT_MODE: AgendaFoldingMode = "smart";

export function useAgendaFoldingPreference() {
   const [mode, setMode] = useState<AgendaFoldingMode>(() => {
      const stored = readBrowserStorage("localStorage", STORAGE_KEY);
      return stored === "single" || stored === "all" || stored === "smart" ? stored : DEFAULT_MODE;
   });

   useEffect(() => {
      writeBrowserStorage("localStorage", STORAGE_KEY, mode);
   }, [mode]);

   return [mode, setMode] as const;
}
