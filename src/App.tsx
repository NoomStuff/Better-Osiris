import { useCallback, useEffect, useMemo, useState } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { LoadingState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./hooks/useKeyboardShortcuts";
import { APP_SHORTCUTS } from "./lib/appShortcuts";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { toDayKey } from "./lib/date";
import { getDayGroups, getPositionedLessons } from "./lib/rosterLayout";
import type { GridZoom, Lesson, ViewMode } from "./types/roster";
import "./styles/App.css";

const STORAGE_KEY = "roster-view-mode";
const MIN_WEEK_OFFSET = 0; // we cant fetch past weeks, so min is 0 (current week)
const MAX_WEEK_OFFSET = 50; // the max we can fetch from the API
const GRID_ZOOM_ORDER = ["hour", "half", "quarter"] as const satisfies readonly GridZoom[];
const FUTURE_WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function getInitialViewMode(): ViewMode {
   if (typeof window === "undefined") {
      return "agenda";
   }

   const stored = window.localStorage.getItem(STORAGE_KEY);
   return stored === "grid" ? "grid" : "agenda";
}

function ensureFontAwesomeKit() {
   if (document.querySelector("script[data-font-awesome-kit]")) {
      return;
   }

   const script = document.createElement("script");
   script.src = "https://kit.fontawesome.com/a7bbea504e.js";
   script.crossOrigin = "anonymous";
   script.dataset["fontAwesomeKit"] = "true";
   document.head.appendChild(script);
}

function setStableViewportHeight() {
   if (typeof window === "undefined" || typeof document === "undefined") {
      return;
   }

   const height = window.innerHeight;
   document.documentElement.style.setProperty("--stable-vh", `${height}px`);
   document.documentElement.style.setProperty("--stable-vh-double", `${height * 2}px`);
   document.documentElement.style.setProperty("--stable-vh-quad", `${height * 4}px`);
}

function getAdjacentZoom(currentZoom: GridZoom, direction: -1 | 1) {
   const currentIndex = GRID_ZOOM_ORDER.indexOf(currentZoom);
   const nextIndex = Math.min(Math.max(currentIndex + direction, 0), GRID_ZOOM_ORDER.length - 1);
   return GRID_ZOOM_ORDER[nextIndex] ?? currentZoom;
}

function getToolbarActionActivationId(viewMode: ViewMode, actionNumber: number) {
   if (viewMode === "agenda") {
      if (actionNumber === 1) {
         return "agenda-expand";
      }

      if (actionNumber === 2) {
         return "agenda-close";
      }

      return undefined;
   }

   const zoom = GRID_ZOOM_ORDER[actionNumber - 1];
   return zoom ? `zoom-${zoom}` : undefined;
}

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const { data, error, loading, refreshing, title } = useRosterWeek(weekOffset);

   useEffect(() => {
      ensureFontAwesomeKit();
   }, []);

   useEffect(() => {
      if (typeof window === "undefined") {
         return;
      }

      let viewportWidth = window.innerWidth;

      setStableViewportHeight();

      const updateForStableViewportChange = () => {
         const nextWidth = window.innerWidth;
         const widthChanged = Math.abs(nextWidth - viewportWidth) > 24;

         if (widthChanged) {
            viewportWidth = nextWidth;
            setStableViewportHeight();
         }
      };

      const updateAfterOrientationChange = () => {
         window.setTimeout(() => {
            viewportWidth = window.innerWidth;
            setStableViewportHeight();
         }, 250);
      };

      window.addEventListener("resize", updateForStableViewportChange);
      window.addEventListener("orientationchange", updateAfterOrientationChange);

      return () => {
         window.removeEventListener("resize", updateForStableViewportChange);
         window.removeEventListener("orientationchange", updateAfterOrientationChange);
      };
   }, []);

   useEffect(() => {
      window.localStorage.setItem(STORAGE_KEY, viewMode);
   }, [viewMode]);

   const positionedLessons = useMemo(() => (data ? getPositionedLessons(data.lessons) : []), [data]);

   const dayGroups = useMemo(() => (data ? getDayGroups(data.week, positionedLessons) : []), [data, positionedLessons]);

   const autoExpandedDays = useMemo(() => {
      if (!data) {
         return new Set<string>();
      }

      const todayKey = toDayKey(new Date());
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const nextExpanded = new Set<string>();

      dayGroups.forEach((group) => {
         const groupStart = new Date(group.date);
         groupStart.setHours(0, 0, 0, 0);
         const hasPassed = groupStart.getTime() < todayStart.getTime();

         if (!hasPassed && (group.key === todayKey || group.lessons.length > 0)) {
            nextExpanded.add(group.key);
         }
      });

      return nextExpanded;
   }, [data, dayGroups]);

   const expandedDays = useMemo(() => {
      if (!data) {
         return new Set<string>();
      }

      if (expandedOverrides.size === 0) {
         return autoExpandedDays;
      }

      const merged = new Set(autoExpandedDays);
      expandedOverrides.forEach((key) => {
         if (merged.has(key)) {
            merged.delete(key);
         } else {
            merged.add(key);
         }
      });

      return merged;
   }, [autoExpandedDays, expandedOverrides, data]);

   const allDayKeys = useMemo(() => dayGroups.map((group) => group.key), [dayGroups]);

   const updateWeekOffset = useCallback((updater: number | ((current: number) => number)) => {
      setWeekOffset((current) => (typeof updater === "function" ? updater(current) : updater));
      setSelectedLessonId(null);
      setAnimateAgenda(false);
      setExpandedOverrides(new Set());
   }, []);

   const selectedLesson: Lesson | null = useMemo(() => {
      if (!data || !selectedLessonId) {
         return null;
      }

      return data.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
   }, [data, selectedLessonId]);

   const toggleDay = (dayKey: string) => {
      setAnimateAgenda(true);
      setExpandedOverrides((current) => {
         const next = new Set(current);
         if (next.has(dayKey)) {
            next.delete(dayKey);
         } else {
            next.add(dayKey);
         }
         return next;
      });
   };

   const expandAllDays = useCallback(() => {
      if (!data) {
         return;
      }

      setAnimateAgenda(true);
      setExpandedOverrides(() => {
         const next = new Set<string>();
         allDayKeys.forEach((key) => {
            if (!autoExpandedDays.has(key)) {
               next.add(key);
            }
         });
         return next;
      });
   }, [allDayKeys, autoExpandedDays, data]);

   const closeAllDays = useCallback(() => {
      if (!data) {
         return;
      }

      setAnimateAgenda(true);
      setExpandedOverrides(() => new Set(autoExpandedDays));
   }, [autoExpandedDays, data]);

   const goPreviousWeek = useCallback(() => {
      updateWeekOffset((current) => Math.max(current - 1, MIN_WEEK_OFFSET));
   }, [updateWeekOffset]);

   const goNextWeek = useCallback(() => {
      updateWeekOffset((current) => Math.min(current + 1, MAX_WEEK_OFFSET));
   }, [updateWeekOffset]);

   const handleCurrentWeek = useCallback(() => {
      if (weekOffset === 0) {
         setSelectedLessonId(null);
         setAnimateAgenda(true);
         setExpandedOverrides(new Set());
         return;
      }

      updateWeekOffset(0);
   }, [updateWeekOffset, weekOffset]);

   const openSettings = useCallback(() => {
      setIsSettingsOpen(true);
   }, []);

   const moveToolbarAction = useCallback(
      (direction: -1 | 1) => {
         if (viewMode === "agenda") {
            if (direction < 0) {
               expandAllDays();
            } else {
               closeAllDays();
            }
            return;
         }

         setGridZoom((current) => {
            return getAdjacentZoom(current, direction);
         });
      },
      [closeAllDays, expandAllDays, viewMode]
   );

   const selectToolbarAction = useCallback(
      (actionNumber: number) => {
         if (viewMode === "agenda") {
            if (actionNumber === 1) {
               expandAllDays();
            } else if (actionNumber === 2) {
               closeAllDays();
            }
            return;
         }

         const nextZoom = GRID_ZOOM_ORDER[actionNumber - 1];
         if (nextZoom) {
            setGridZoom(nextZoom);
         }
      },
      [closeAllDays, expandAllDays, viewMode]
   );

   const keyboardShortcuts = useMemo<KeyboardShortcut[]>(
      () => [
         {
            id: "previous-week",
            ...APP_SHORTCUTS.previousWeek,
            activationTargetId: "previous-week",
            disabled: weekOffset <= MIN_WEEK_OFFSET,
            onPress: goPreviousWeek,
         },
         {
            id: "next-week",
            ...APP_SHORTCUTS.nextWeek,
            activationTargetId: "next-week",
            disabled: weekOffset >= MAX_WEEK_OFFSET,
            onPress: goNextWeek,
         },
         {
            id: "current-week-r",
            ...APP_SHORTCUTS.currentWeek,
            activationTargetId: "current-week",
            onPress: handleCurrentWeek,
         },
         {
            id: "current-week-0",
            key: "0",
            activationTargetId: "current-week",
            onPress: handleCurrentWeek,
         },
         {
            id: "agenda-view",
            ...APP_SHORTCUTS.agendaView,
            activationTargetId: "agenda-view",
            onPress: () => setViewMode("agenda"),
         },
         {
            id: "grid-view",
            ...APP_SHORTCUTS.gridView,
            activationTargetId: "grid-view",
            onPress: () => setViewMode("grid"),
         },
         {
            id: "open-settings",
            ...APP_SHORTCUTS.settings,
            activationTargetId: "settings",
            onPress: openSettings,
         },
         {
            id: "previous-toolbar-action",
            ...APP_SHORTCUTS.previousToolbarAction,
            activationTargetId: viewMode === "agenda" ? "agenda-expand" : `zoom-${getAdjacentZoom(gridZoom, -1)}`,
            onPress: () => moveToolbarAction(-1),
         },
         {
            id: "next-toolbar-action",
            ...APP_SHORTCUTS.nextToolbarAction,
            activationTargetId: viewMode === "agenda" ? "agenda-close" : `zoom-${getAdjacentZoom(gridZoom, 1)}`,
            onPress: () => moveToolbarAction(1),
         },
         ...FUTURE_WEEK_KEYS.map<KeyboardShortcut>((key) => ({
            id: `future-week-${key}`,
            key,
            onPress: () => updateWeekOffset(Number(key)),
         })),
         ...FUTURE_WEEK_KEYS.map<KeyboardShortcut>((key) => ({
            id: `toolbar-action-${key}`,
            ctrlKey: true,
            key,
            activationTargetId: getToolbarActionActivationId(viewMode, Number(key)),
            onPress: () => selectToolbarAction(Number(key)),
         })),
      ],
      [goNextWeek, goPreviousWeek, gridZoom, handleCurrentWeek, moveToolbarAction, openSettings, selectToolbarAction, updateWeekOffset, viewMode, weekOffset]
   );

   useKeyboardShortcuts(keyboardShortcuts, !isSettingsOpen && selectedLesson === null);

   return (
      <div className="shell">
         <div className="mobile-bottom-bar">
            <AppToolbar
               viewMode={viewMode}
               gridZoom={gridZoom}
               isRefreshing={refreshing}
               onChangeView={setViewMode}
               onChangeGridZoom={setGridZoom}
               onExpandAllAgenda={expandAllDays}
               onCloseAllAgenda={closeAllDays}
               onOpenSettings={openSettings}
            />

            <WeekNavigator
               title={title}
               weekOffset={weekOffset}
               onPreviousWeek={goPreviousWeek}
               onNextWeek={goNextWeek}
               onCurrentWeek={handleCurrentWeek}
               canGoPrevious={weekOffset > MIN_WEEK_OFFSET}
               canGoNext={weekOffset < MAX_WEEK_OFFSET}
            />
         </div>

         <main className="app-content">
            {loading ? (
               <section className="app-content-frame view-enter">
                  <LoadingState message="Fetching week data." />
               </section>
            ) : error && !data ? (
               <section className="app-content-frame view-enter">
                  <LoadingState message={error} />
               </section>
            ) : data ? (
               <section
                  className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${gridZoom} view-enter`}
                  key={`${viewMode}-${weekOffset}`}
               >
                  {viewMode === "agenda" ? (
                     <AgendaView
                        groups={dayGroups}
                        expandedDays={expandedDays}
                        animate={animateAgenda}
                        onToggleDay={toggleDay}
                        onSelectLesson={(lesson) => setSelectedLessonId(lesson.id)}
                     />
                  ) : (
                     <GridView groups={dayGroups} zoom={gridZoom} onSelectLesson={(lesson) => setSelectedLessonId(lesson.id)} />
                  )}
               </section>
            ) : null}
         </main>

         <LessonDrawer lesson={selectedLesson} onClose={() => setSelectedLessonId(null)} />
         <SettingsDialog isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </div>
   );
}
