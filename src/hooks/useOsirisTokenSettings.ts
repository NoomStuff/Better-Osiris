import { useEffect, useSyncExternalStore } from "react";
import { getSessionSnapshot, startSession, subscribeSession } from "../lib/sessionStore";

export function useOsirisTokenSettings() {
   const state = useSyncExternalStore(subscribeSession, getSessionSnapshot);
   useEffect(startSession, []);
   return { ...state, hasBearerToken: state.settings?.hasBearerToken === true, weeksResetKey: state.revision };
}
