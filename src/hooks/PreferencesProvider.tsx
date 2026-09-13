import { useMemo, type ReactNode } from "react";
import { PreferencesContext, type Preferences } from "./preferences";
import { useAgendaFoldingPreference } from "./useAgendaFoldingPreference";
import { useDevPreview } from "./useDevPreview";
import { useGridHoursPreference } from "./useGridHoursPreference";
import { useShownWeekdaysPreference } from "./useShownWeekdaysPreference";
import { useThemePreference } from "./useThemePreference";
import { useViewModePreference } from "./useViewModePreference";

export function PreferencesProvider({ children }: { children: ReactNode }) {
   const [viewMode, setViewMode] = useViewModePreference();
   const [theme, setTheme] = useThemePreference();
   const [shownWeekdays, setShownWeekdays] = useShownWeekdaysPreference();
   const [gridHours, setGridHours] = useGridHoursPreference();
   const [agendaFoldingMode, setAgendaFoldingMode] = useAgendaFoldingPreference();
   const devPreview = useDevPreview();
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
