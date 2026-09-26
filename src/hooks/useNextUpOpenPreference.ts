import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

const STORAGE_KEY = "roster-next-up-open";

/** Whether the next-up card hangs open; the agenda rests on the countdown pill until the user pulls it open. */
export function useNextUpOpenPreference() {
   const [isOpen, setIsOpen] = useState(() => readBrowserStorage("localStorage", STORAGE_KEY) === "true");

   useEffect(() => {
      writeBrowserStorage("localStorage", STORAGE_KEY, String(isOpen));
   }, [isOpen]);

   return [isOpen, setIsOpen] as const;
}
