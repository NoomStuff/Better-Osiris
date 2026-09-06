import { clearOsirisToken, fetchOsirisTokenSettings, saveOsirisToken } from "../api/settings";
import type { OsirisTokenSettings } from "../../shared/weeks";
import { readBrowserStorage, writeBrowserStorage } from "./browserStorage";
import { clearWeekBrowserCache } from "./weekCache";

export const SESSION_EPOCH_KEY = "roster-session-epoch-v1";
interface SessionState {
   settings: OsirisTokenSettings | null;
   isInitialLoading: boolean;
   initialLoadError: string | null;
   isMutating: boolean;
   revision: number;
}
let state: SessionState = { settings: null, isInitialLoading: true, initialLoadError: null, isMutating: false, revision: 0 };
const listeners = new Set<() => void>();
const invalidators = new Set<() => void>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let users = 0;

export const getSessionSnapshot = () => state;
export const getSessionEpoch = () => readBrowserStorage("localStorage", SESSION_EPOCH_KEY);
export function subscribeSession(listener: () => void) {
   listeners.add(listener);
   return () => {
      listeners.delete(listener);
   };
}
export function onSessionInvalidated(listener: () => void) {
   invalidators.add(listener);
   return () => {
      invalidators.delete(listener);
   };
}
function publish(update: Partial<SessionState>) {
   state = { ...state, ...update };
   listeners.forEach((listener) => listener());
}

function invalidate() {
   generation += 1;
   clearTimeout(timer);
   invalidators.forEach((listener) => listener());
   publish({ settings: null, isInitialLoading: true, revision: state.revision + 1 });
}

async function loadSettings(delay = 250): Promise<void> {
   const requestGeneration = generation;
   const epoch = getSessionEpoch();
   try {
      const settings = await fetchOsirisTokenSettings();
      if (requestGeneration !== generation || epoch !== getSessionEpoch()) return;
      if (!settings.hasBearerToken) clearWeekBrowserCache();
      publish({ settings, isInitialLoading: false, initialLoadError: null });
   } catch (error) {
      if (requestGeneration !== generation) return;
      publish({ initialLoadError: error instanceof Error ? error.message : "Bearer token settings could not be loaded." });
      timer = setTimeout(() => {
         void loadSettings(Math.min(delay * 2, 5000));
      }, delay);
   }
}

export function refreshSession() {
   invalidate();
   return loadSettings();
}
/** Authentication failures may refresh settings without erasing the failed week or retrying it forever. */
export async function checkSessionAfterAuthError() {
   const requestGeneration = generation;
   try {
      const settings = await fetchOsirisTokenSettings();
      if (requestGeneration !== generation) return;
      if (settings.contextId !== state.settings?.contextId) {
         clearWeekBrowserCache();
         invalidate();
      }
      publish({ settings, isInitialLoading: false, initialLoadError: null });
   } catch {
      /* The existing roster error remains the recovery surface. */
   }
}
function onStorage(event: StorageEvent) {
   if (event.key === SESSION_EPOCH_KEY) void refreshSession();
}
function onOnline() {
   if (state.isInitialLoading && !state.isMutating) {
      clearTimeout(timer);
      void loadSettings();
   }
}

export function startSession() {
   users += 1;
   if (users === 1) {
      window.addEventListener("storage", onStorage);
      window.addEventListener("online", onOnline);
      void loadSettings();
   }
   return () => {
      users -= 1;
      if (!users) {
         generation += 1;
         clearTimeout(timer);
         window.removeEventListener("storage", onStorage);
         window.removeEventListener("online", onOnline);
      }
   };
}

async function mutate(run: () => Promise<OsirisTokenSettings>) {
   publish({ isMutating: true });
   try {
      const settings = await run();
      writeBrowserStorage("localStorage", SESSION_EPOCH_KEY, crypto.randomUUID());
      clearWeekBrowserCache();
      invalidate();
      publish({ settings, isInitialLoading: false, initialLoadError: null });
      return settings;
   } finally {
      publish({ isMutating: false });
   }
}
export const saveSessionToken = (token: string) => mutate(() => saveOsirisToken(token));
export const clearSessionToken = () => mutate(clearOsirisToken);
