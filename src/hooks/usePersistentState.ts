import { useEffect, useState } from "react";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

/** Converts one saved preference. `read` receives null when nothing is stored and must return a usable value. */
export interface StorageCodec<T> {
   read: (stored: string | null) => T;
   write: (value: T) => string;
}

export function enumCodec<const T extends string>(values: readonly T[], fallback: T | (() => T)): StorageCodec<T> {
   return {
      read: (stored) => values.find((value) => value === stored) ?? (typeof fallback === "function" ? fallback() : fallback),
      write: (value) => value,
   };
}

export const booleanCodec: StorageCodec<boolean> = { read: (stored) => stored === "true", write: String };

/** Local state mirrored to localStorage. Codecs must be module constants so the write effect stays stable. */
export function usePersistentState<T>(key: string, codec: StorageCodec<T>) {
   const [value, setValue] = useState(() => codec.read(readBrowserStorage("localStorage", key)));

   useEffect(() => {
      writeBrowserStorage("localStorage", key, codec.write(value));
   }, [codec, key, value]);

   return [value, setValue] as const;
}
