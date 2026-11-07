import { useCallback, useEffect, useState } from "react";
import { isDevClassStatusPreviewMode, type DevClassStatusPreviewMode } from "../lib/devStatusPreview";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

const ENABLED_KEY = "roster-devtools-enabled";
const TIME_KEY = "roster-devtools-time-override";
const STATUS_KEY = "roster-devtools-status-preview";
const HAS_DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS;

function getInitialEnabled() {
   return HAS_DEV_TOOLS && readBrowserStorage("localStorage", ENABLED_KEY) === "true";
}

function getInitialTimeOverride(): Date | null {
   if (!HAS_DEV_TOOLS) return null;
   const stored = readBrowserStorage("localStorage", TIME_KEY);
   if (!stored) return null;
   const date = new Date(stored);
   return Number.isNaN(date.getTime()) ? null : date;
}

function getInitialStatus(): DevClassStatusPreviewMode {
   if (!HAS_DEV_TOOLS) return "none";
   const stored = readBrowserStorage("localStorage", STATUS_KEY);
   return isDevClassStatusPreviewMode(stored) ? stored : "none";
}

export function useDevPreview() {
   const [isEnabled, setIsEnabled] = useState(getInitialEnabled);
   const [timeOverride, setTimeOverride] = useState<Date | null>(getInitialTimeOverride);
   const [statusPreviewMode, setStatusPreviewMode] = useState<DevClassStatusPreviewMode>(getInitialStatus);

   useEffect(() => {
      if (HAS_DEV_TOOLS) writeBrowserStorage("localStorage", ENABLED_KEY, String(isEnabled));
   }, [isEnabled]);
   useEffect(() => {
      if (!HAS_DEV_TOOLS) return;
      if (timeOverride) writeBrowserStorage("localStorage", TIME_KEY, timeOverride.toISOString());
      else removeBrowserStorage("localStorage", TIME_KEY);
   }, [timeOverride]);
   useEffect(() => {
      if (HAS_DEV_TOOLS) writeBrowserStorage("localStorage", STATUS_KEY, statusPreviewMode);
   }, [statusPreviewMode]);

   const toggle = useCallback((enabled: boolean) => {
      if (!HAS_DEV_TOOLS) return;
      setIsEnabled(enabled);
      if (!enabled) setTimeOverride(null);
   }, []);

   const changeTimeOverride = useCallback((date: Date | null) => {
      if (!HAS_DEV_TOOLS) return;
      setTimeOverride(date);
   }, []);

   return {
      isEnabled,
      statusPreviewMode,
      timeOverride,
      toggle,
      changeTimeOverride,
      setStatusPreviewMode,
   };
}
