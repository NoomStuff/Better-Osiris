import { useCallback, useEffect, useState } from "react";
import { isDevLessonStatusPreviewMode, type DevLessonStatusPreviewMode } from "../lib/devRosterStatusPreview";

const ENABLED_KEY = "roster-devtools-enabled";
const TIME_KEY = "roster-devtools-time-override";
const STATUS_KEY = "roster-devtools-status-preview";
const IS_DEV_SERVER = import.meta.env.DEV;

function getInitialEnabled() {
   return IS_DEV_SERVER && window.localStorage.getItem(ENABLED_KEY) === "true";
}

function getInitialTimeOverride(): Date | null {
   if (!IS_DEV_SERVER) return null;
   const stored = window.localStorage.getItem(TIME_KEY);
   if (!stored) return null;
   const date = new Date(stored);
   return Number.isNaN(date.getTime()) ? null : date;
}

function getInitialStatus(): DevLessonStatusPreviewMode {
   if (!IS_DEV_SERVER) return "none";
   const stored = window.localStorage.getItem(STATUS_KEY);
   return isDevLessonStatusPreviewMode(stored) ? stored : "none";
}

export function useDevRosterPreview() {
   const [clockNow, setClockNow] = useState(() => new Date());
   const [isEnabled, setIsEnabled] = useState(getInitialEnabled);
   const [timeOverride, setTimeOverride] = useState<Date | null>(getInitialTimeOverride);
   const [statusPreviewMode, setStatusPreviewMode] = useState<DevLessonStatusPreviewMode>(getInitialStatus);

   useEffect(() => {
      const update = () => setClockNow(new Date());
      update();
      const interval = window.setInterval(update, 1_000);
      return () => window.clearInterval(interval);
   }, []);

   useEffect(() => {
      if (IS_DEV_SERVER) window.localStorage.setItem(ENABLED_KEY, String(isEnabled));
   }, [isEnabled]);
   useEffect(() => {
      if (!IS_DEV_SERVER) return;
      if (timeOverride) window.localStorage.setItem(TIME_KEY, timeOverride.toISOString());
      else window.localStorage.removeItem(TIME_KEY);
   }, [timeOverride]);
   useEffect(() => {
      if (IS_DEV_SERVER) window.localStorage.setItem(STATUS_KEY, statusPreviewMode);
   }, [statusPreviewMode]);

   const toggle = useCallback((enabled: boolean) => {
      if (!IS_DEV_SERVER) return;
      setIsEnabled(enabled);
      if (!enabled) setTimeOverride(null);
   }, []);

   const changeTimeOverride = useCallback((date: Date | null) => {
      if (!IS_DEV_SERVER) return;
      setTimeOverride(date);
      setIsEnabled(true);
   }, []);

   return {
      isEnabled,
      perceivedNow: isEnabled && timeOverride ? timeOverride : clockNow,
      statusPreviewMode,
      timeOverride,
      toggle,
      changeTimeOverride,
      setStatusPreviewMode,
   };
}
