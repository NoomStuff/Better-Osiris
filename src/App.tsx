import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { ErrorState, LoadingState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { fetchOsirisTokenSettings } from "./api/settings";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./hooks/useKeyboardShortcuts";
import { APP_SHORTCUTS } from "./lib/appShortcuts";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/rosterFlavor";
import { getDayGroups, getPositionedLessons } from "./lib/rosterLayout";
import type { GridZoom, Lesson, RosterWeek, ViewMode } from "./types/roster";
import "./styles/App.css";

const STORAGE_KEY = "roster-view-mode";
const DEVTOOLS_STORAGE_KEY = "roster-devtools-enabled";
const DEVTOOLS_TIME_STORAGE_KEY = "roster-devtools-time-override";
const MIN_WEEK_OFFSET = -1;
const MAX_WEEK_OFFSET = 50; // the max we can fetch from the API
const GRID_ZOOM_ORDER = ["hour", "half", "quarter"] as const satisfies readonly GridZoom[];
const FUTURE_WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const IS_DEV_SERVER = import.meta.env.DEV;
const WEEK_SWIPE_MIN_DISTANCE_PX = 56;
const WEEK_SWIPE_MAX_VERTICAL_DRIFT_PX = 72;

type WeekTransitionDirection = "default" | "previous" | "next" | "settled";

interface WeekSwipeStart {
   x: number;
   y: number;
}

function getInitialViewMode(): ViewMode {
   if (typeof window === "undefined") {
      return "agenda";
   }

   const stored = window.localStorage.getItem(STORAGE_KEY);
   return stored === "grid" ? "grid" : "agenda";
}

function getInitialDevToolsEnabled() {
   if (!IS_DEV_SERVER || typeof window === "undefined") {
      return false;
   }

   return window.localStorage.getItem(DEVTOOLS_STORAGE_KEY) === "true";
}

function getInitialTimeOverride(): Date | null {
   if (!IS_DEV_SERVER || typeof window === "undefined") {
      return null;
   }

   const stored = window.localStorage.getItem(DEVTOOLS_TIME_STORAGE_KEY);
   if (!stored) {
      return null;
   }

   const date = new Date(stored);
   return Number.isNaN(date.getTime()) ? null : date;
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

function EmptyWeekState({ week }: { week: RosterWeek }) {
   const message = getEmptyWeekMessage(week.number, week.offset);

   return (
      <div className="empty-week-state">
         <i className={message.icon} aria-hidden="true" />
         <h3>{message.title}</h3>
         <p>{message.detail}</p>
      </div>
   );
}

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [weekTransitionDirection, setWeekTransitionDirection] = useState<WeekTransitionDirection>("default");
   const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [hasCustomToken, setHasCustomToken] = useState(false);
   const [clockNow, setClockNow] = useState(() => new Date());
   const [isDevToolsEnabled, setIsDevToolsEnabled] = useState(getInitialDevToolsEnabled);
   const [timeOverride, setTimeOverride] = useState<Date | null>(getInitialTimeOverride);
   const weekSwipeStartRef = useRef<WeekSwipeStart | null>(null);
   const { data, error, loading, retryCountdownMs, retrying, refreshing, title } = useRosterWeek(weekOffset);
   const perceivedNow = isDevToolsEnabled && timeOverride ? timeOverride : clockNow;
   const errorDetail = useMemo(() => {
      if (!error) {
         return "";
      }

      if (error.isAuthRelated && hasCustomToken) {
         return `${error.detail} Your custom bearer token might be expired or pasted wrong. Settings is the place to poke it.`;
      }

      return error.detail;
   }, [error, hasCustomToken]);

   useEffect(() => {
      ensureFontAwesomeKit();
   }, []);

   useEffect(() => {
      const updateNow = () => setClockNow(new Date());
      updateNow();

      const interval = window.setInterval(updateNow, 1_000);
      return () => window.clearInterval(interval);
   }, []);

   useEffect(() => {
      if (!IS_DEV_SERVER) {
         return;
      }

      window.localStorage.setItem(DEVTOOLS_STORAGE_KEY, String(isDevToolsEnabled));
   }, [isDevToolsEnabled]);

   useEffect(() => {
      if (!IS_DEV_SERVER) {
         return;
      }

      if (timeOverride) {
         window.localStorage.setItem(DEVTOOLS_TIME_STORAGE_KEY, timeOverride.toISOString());
      } else {
         window.localStorage.removeItem(DEVTOOLS_TIME_STORAGE_KEY);
      }
   }, [timeOverride]);

   useEffect(() => {
      if (!error?.isAuthRelated) {
         return;
      }

      let isStale = false;
      fetchOsirisTokenSettings()
         .then((settings) => {
            if (!isStale) {
               setHasCustomToken(settings.hasCustomToken);
            }
         })
         .catch(() => {
            if (!isStale) {
               setHasCustomToken(false);
            }
         });

      return () => {
         isStale = true;
      };
   }, [error?.isAuthRelated]);

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

      const isCurrentWeek = data.week.offset === 0;
      const todayKey = toDayKey(perceivedNow);
      const todayStart = new Date(perceivedNow);
      todayStart.setHours(0, 0, 0, 0);
      const nextExpanded = new Set<string>();

      dayGroups.forEach((group) => {
         const groupStart = new Date(group.date);
         groupStart.setHours(0, 0, 0, 0);
         const hasPassed = isCurrentWeek && groupStart.getTime() < todayStart.getTime();

         if (!hasPassed && (group.key === todayKey || group.lessons.length > 0)) {
            nextExpanded.add(group.key);
         }
      });

      return nextExpanded;
   }, [data, dayGroups, perceivedNow]);

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

   const updateWeekOffset = useCallback(
      (updater: number | ((current: number) => number), transitionDirection: WeekTransitionDirection = "default") => {
         const next = typeof updater === "function" ? updater(weekOffset) : updater;

         if (next === weekOffset) {
            return;
         }

         setWeekTransitionDirection(transitionDirection);
         setWeekOffset(next);
         setSelectedLessonId(null);
         setAnimateAgenda(false);
         setExpandedOverrides(new Set());
      },
      [weekOffset]
   );

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
      updateWeekOffset((current) => Math.max(current - 1, MIN_WEEK_OFFSET), "previous");
   }, [updateWeekOffset]);

   const goNextWeek = useCallback(() => {
      updateWeekOffset((current) => Math.min(current + 1, MAX_WEEK_OFFSET), "next");
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

   const handleWeekSwipeStart = useCallback((event: TouchEvent) => {
      if (event.touches.length !== 1) {
         weekSwipeStartRef.current = null;
         return;
      }

      const touch = event.touches[0];
      if (!touch) {
         return;
      }

      weekSwipeStartRef.current = {
         x: touch.clientX,
         y: touch.clientY,
      };
   }, []);

   const handleWeekSwipeEnd = useCallback(
      (event: TouchEvent) => {
         const swipeStart = weekSwipeStartRef.current;
         weekSwipeStartRef.current = null;

         if (!swipeStart || event.changedTouches.length !== 1) {
            return;
         }

         const touch = event.changedTouches[0];
         if (!touch) {
            return;
         }

         const deltaX = touch.clientX - swipeStart.x;
         const deltaY = touch.clientY - swipeStart.y;
         const absX = Math.abs(deltaX);
         const absY = Math.abs(deltaY);

         if (absX < WEEK_SWIPE_MIN_DISTANCE_PX || absY > WEEK_SWIPE_MAX_VERTICAL_DRIFT_PX || absX < absY * 1.2) {
            return;
         }

         if (deltaX < 0) {
            goNextWeek();
            return;
         }

         goPreviousWeek();
      },
      [goNextWeek, goPreviousWeek]
   );

   const handleWeekSwipeCancel = useCallback(() => {
      weekSwipeStartRef.current = null;
   }, []);

   useEffect(() => {
      window.addEventListener("touchstart", handleWeekSwipeStart, { passive: true });
      window.addEventListener("touchend", handleWeekSwipeEnd, { passive: true });
      window.addEventListener("touchcancel", handleWeekSwipeCancel, { passive: true });

      return () => {
         window.removeEventListener("touchstart", handleWeekSwipeStart);
         window.removeEventListener("touchend", handleWeekSwipeEnd);
         window.removeEventListener("touchcancel", handleWeekSwipeCancel);
      };
   }, [handleWeekSwipeCancel, handleWeekSwipeEnd, handleWeekSwipeStart]);

   const handleWeekTransitionEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target) {
         return;
      }

      setWeekTransitionDirection("settled");
   }, []);

   const changeViewMode = useCallback((nextViewMode: ViewMode) => {
      setWeekTransitionDirection("default");
      setViewMode(nextViewMode);
   }, []);

   const openSettings = useCallback(() => {
      setIsSettingsOpen(true);
   }, []);

   const toggleDevTools = useCallback((enabled: boolean) => {
      if (!IS_DEV_SERVER) {
         return;
      }

      setIsDevToolsEnabled(enabled);
      if (!enabled) {
         setTimeOverride(null);
      }
   }, []);

   const changeTimeOverride = useCallback((date: Date | null) => {
      if (!IS_DEV_SERVER) {
         return;
      }

      setTimeOverride(date);
      setIsDevToolsEnabled(true);
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
            onPress: () => changeViewMode("agenda"),
         },
         {
            id: "grid-view",
            ...APP_SHORTCUTS.gridView,
            activationTargetId: "grid-view",
            onPress: () => changeViewMode("grid"),
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
      [
         changeViewMode,
         goNextWeek,
         goPreviousWeek,
         gridZoom,
         handleCurrentWeek,
         moveToolbarAction,
         openSettings,
         selectToolbarAction,
         updateWeekOffset,
         viewMode,
         weekOffset,
      ]
   );

   useKeyboardShortcuts(keyboardShortcuts, !isSettingsOpen && selectedLesson === null);

   return (
      <div className="shell">
         <div className="mobile-bottom-bar">
            <AppToolbar
               viewMode={viewMode}
               gridZoom={gridZoom}
               isRefreshing={refreshing || retrying}
               onChangeView={changeViewMode}
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
               <section className="app-content-frame view-enter" data-week-transition={weekTransitionDirection} onAnimationEnd={handleWeekTransitionEnd}>
                  <LoadingState message="Fetching week data." />
               </section>
            ) : error && !data ? (
               <section className="app-content-frame view-enter" data-week-transition={weekTransitionDirection} onAnimationEnd={handleWeekTransitionEnd}>
                  <ErrorState
                     title={error.title}
                     detail={errorDetail}
                     log={error.log}
                     retryCountdownMs={retryCountdownMs}
                     isRetrying={retrying}
                  />
               </section>
            ) : data ? (
               <section
                  className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${gridZoom} view-enter`}
                  data-empty-week={data.lessons.length === 0}
                  data-week-transition={weekTransitionDirection}
                  onAnimationEnd={handleWeekTransitionEnd}
                  key={`${viewMode}-${weekOffset}`}
               >
                  {viewMode === "agenda" ? (
                     <AgendaView
                        groups={dayGroups}
                        expandedDays={expandedDays}
                        animate={animateAgenda}
                        now={perceivedNow}
                        onToggleDay={toggleDay}
                        onSelectLesson={(lesson) => setSelectedLessonId(lesson.id)}
                     />
                  ) : (
                     <GridView groups={dayGroups} zoom={gridZoom} now={perceivedNow} onSelectLesson={(lesson) => setSelectedLessonId(lesson.id)} />
                  )}
                  {data.lessons.length === 0 ? <EmptyWeekState week={data.week} /> : null}
               </section>
            ) : null}
         </main>

         <LessonDrawer lesson={selectedLesson} onClose={() => setSelectedLessonId(null)} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            isDevToolsEnabled={isDevToolsEnabled}
            perceivedNow={perceivedNow}
            timeOverride={timeOverride}
            onClose={() => setIsSettingsOpen(false)}
            onToggleDevTools={toggleDevTools}
            onChangeTimeOverride={changeTimeOverride}
         />
      </div>
   );
}
