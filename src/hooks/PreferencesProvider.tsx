import { useEffect, useMemo, type ReactNode } from "react";
import { PreferencesContext, type Preferences } from "./preferences";
import { useDevPreview } from "./useDevPreview";
import { enumCodec, usePersistentState, type StorageCodec } from "./usePersistentState";
import type { AgendaFoldingMode } from "../lib/agendaPolicy";
import type { IsoWeekday } from "../lib/date";
import { DEFAULT_GRID_HOURS, GRID_HOUR_MAX, GRID_HOUR_MIN, normalizeGridHourRange, type GridHourRange } from "../lib/gridHours";
import { applyTheme, getDeviceThemeMode, isThemeId, THEME_STORAGE_KEY } from "../lib/theme";
import { DEFAULT_SHOWN_WEEKDAYS, ISO_WEEKDAYS } from "../lib/weekLayout";
import type { ThemeId } from "../styles/themes/registry";
import type { ViewMode } from "../types/weeks";

const viewModeCodec = enumCodec<ViewMode>(["agenda", "grid"], () => (window.matchMedia("(max-width: 480px)").matches ? "agenda" : "grid"));
const agendaFoldingCodec = enumCodec<AgendaFoldingMode>(["single", "smart", "all"], "smart");
const themeCodec: StorageCodec<ThemeId> = { read: (stored) => (isThemeId(stored) ? stored : getDeviceThemeMode()), write: (theme) => theme };

const shownWeekdaysCodec: StorageCodec<IsoWeekday[]> = {
   read: (stored) => {
      const values = new Set(stored?.split(",").map(Number));
      const weekdays = ISO_WEEKDAYS.filter((weekday) => values.has(weekday));
      return weekdays.length > 0 ? weekdays : [...DEFAULT_SHOWN_WEEKDAYS];
   },
   write: (weekdays) => weekdays.join(","),
};

const gridHoursCodec: StorageCodec<GridHourRange> = {
   read: (stored) => {
      const [start = Number.NaN, end = Number.NaN] = (stored ?? "").split(",").map(Number);
      return Number.isInteger(start) && Number.isInteger(end) && start >= GRID_HOUR_MIN && end <= GRID_HOUR_MAX && start < end
         ? normalizeGridHourRange(start, end)
         : DEFAULT_GRID_HOURS;
   },
   write: (range) => range.join(","),
};

export function PreferencesProvider({ children }: { children: ReactNode }) {
   const [viewMode, setViewMode] = usePersistentState("roster-view-mode", viewModeCodec);
   const [theme, setTheme] = usePersistentState(THEME_STORAGE_KEY, themeCodec);
   const [shownWeekdays, setShownWeekdays] = usePersistentState("roster-shown-weekdays", shownWeekdaysCodec);
   const [gridHours, setGridHours] = usePersistentState("roster-grid-hours", gridHoursCodec);
   const [agendaFoldingMode, setAgendaFoldingMode] = usePersistentState("roster-agenda-folding", agendaFoldingCodec);
   const devPreview = useDevPreview();
   useEffect(() => applyTheme(theme, { animate: true }), [theme]);
   const value = useMemo<Preferences>(
      () => ({
         agendaFoldingMode,
         devPreview,
         gridHours,
         setAgendaFoldingMode,
         setGridHours,
         setShownWeekdays,
         setTheme,
         setViewMode,
         shownWeekdays,
         theme,
         viewMode,
      }),
      [agendaFoldingMode, devPreview, gridHours, setAgendaFoldingMode, setGridHours, setShownWeekdays, setTheme, setViewMode, shownWeekdays, theme, viewMode]
   );
   return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
