import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { AgendaFoldingMode } from "./useAgendaFoldingPreference";
import type { useDevPreview } from "./useDevPreview";
import type { IsoWeekday } from "../lib/date";
import type { GridHourRange } from "../lib/gridHours";
import type { ThemeId } from "../styles/themes/registry";
import type { ViewMode } from "../types/weeks";

export interface Preferences {
   agendaFoldingMode: AgendaFoldingMode;
   devPreview: ReturnType<typeof useDevPreview>;
   gridHours: GridHourRange;
   setAgendaFoldingMode: Dispatch<SetStateAction<AgendaFoldingMode>>;
   setGridHours: Dispatch<SetStateAction<GridHourRange>>;
   setShownWeekdays: Dispatch<SetStateAction<IsoWeekday[]>>;
   setTheme: Dispatch<SetStateAction<ThemeId>>;
   setViewMode: Dispatch<SetStateAction<ViewMode>>;
   shownWeekdays: IsoWeekday[];
   theme: ThemeId;
   viewMode: ViewMode;
}

export const PreferencesContext = createContext<Preferences | null>(null);

/** The persisted app-wide preferences, shared between the views and the settings dialog. */
export function usePreferences() {
   const preferences = useContext(PreferencesContext);
   if (!preferences) {
      throw new Error("usePreferences requires PreferencesProvider.");
   }
   return preferences;
}
