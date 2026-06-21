import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { BearerTokenState, ErrorState, LoadingState, RosterOverlayState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { fetchOsirisTokenSettings, saveOsirisToken, type OsirisTokenSettings } from "./api/settings";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./hooks/useKeyboardShortcuts";
import { APP_SHORTCUTS } from "./lib/appShortcuts";
import { applyDevLessonStatusPreview, isDevLessonStatusPreviewMode, type DevLessonStatusPreviewMode } from "./lib/devRosterStatusPreview";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { getIsoWeekNumber, toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/rosterFlavor";
import { notifyError, notifySuccess } from "./lib/notyf";
import { getDayGroups, getPositionedLessons } from "./lib/rosterLayout";
import { MAX_WEEK_OFFSET, MIN_WEEK_OFFSET } from "../shared/rosterTime";
import type { GridZoom, Lesson, RosterWeek, ViewMode } from "./types/roster";
import "./styles/App.css";

const STORAGE_KEY = "roster-view-mode";
const CURRENT_WEEK_CACHE_KEY = "roster-current-week-cache-v2";
const DEVTOOLS_STORAGE_KEY = "roster-devtools-enabled";
const DEVTOOLS_TIME_STORAGE_KEY = "roster-devtools-time-override";
const DEVTOOLS_STATUS_PREVIEW_STORAGE_KEY = "roster-devtools-status-preview";
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

function getInitialStatusPreviewMode(): DevLessonStatusPreviewMode {
   if (!IS_DEV_SERVER || typeof window === "undefined") {
      return "none";
   }

   const stored = window.localStorage.getItem(DEVTOOLS_STATUS_PREVIEW_STORAGE_KEY);
   return isDevLessonStatusPreviewMode(stored) ? stored : "none";
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

   return <RosterOverlayState icon={message.icon} title={message.title} detail={message.detail} />;
}

function getDefaultExpandedDays(groups: ReturnType<typeof getDayGroups>, weekOffset: number, now: Date) {
   const todayKey = toDayKey(now);
   const todayStart = new Date(now);
   todayStart.setHours(0, 0, 0, 0);
   const nextExpanded = new Set<string>();

   groups.forEach((group) => {
      const groupStart = new Date(group.date);
      groupStart.setHours(0, 0, 0, 0);
      const hasPassed = weekOffset === 0 && groupStart.getTime() < todayStart.getTime();

      if (!hasPassed && (group.key === todayKey || group.lessons.length > 0)) {
         nextExpanded.add(group.key);
      }
   });

   return nextExpanded;
}

function getBlankRosterWeek(offset: number, now: Date): RosterWeek {
   const monday = new Date(now);
   monday.setHours(12, 0, 0, 0);
   const day = monday.getDay();
   const mondayDelta = day === 0 ? -6 : 1 - day;
   monday.setDate(monday.getDate() + mondayDelta + offset * 7);

   const friday = new Date(monday);
   friday.setDate(monday.getDate() + 4);

   return {
      offset,
      number: getIsoWeekNumber(formatLocalIsoDate(monday)),
      start: formatLocalIsoDate(monday),
      end: formatLocalIsoDate(friday),
   };
}

function formatLocalIsoDate(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");

   return `${year}-${month}-${day}`;
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
   const [tokenSettings, setTokenSettings] = useState<OsirisTokenSettings | null>(null);
   const [isTokenSettingsLoading, setIsTokenSettingsLoading] = useState(true);
   const [bearerTokenInput, setBearerTokenInput] = useState("");
   const [isSavingBearerToken, setIsSavingBearerToken] = useState(false);
   const [clockNow, setClockNow] = useState(() => new Date());
   const [isDevToolsEnabled, setIsDevToolsEnabled] = useState(getInitialDevToolsEnabled);
   const [timeOverride, setTimeOverride] = useState<Date | null>(getInitialTimeOverride);
   const [devStatusPreviewMode, setDevStatusPreviewMode] = useState<DevLessonStatusPreviewMode>(getInitialStatusPreviewMode);
   const weekSwipeStartRef = useRef<WeekSwipeStart | null>(null);
   const hasBearerToken = tokenSettings?.hasBearerToken === true;
   const { data, error, loading, retryCountdownMs, retrying, refreshing, title } = useRosterWeek(weekOffset, {
      enabled: !isTokenSettingsLoading && hasBearerToken,
   });
   const perceivedNow = isDevToolsEnabled && timeOverride ? timeOverride : clockNow;
   const displayedData = useMemo(
      () => applyDevLessonStatusPreview(data, IS_DEV_SERVER && isDevToolsEnabled ? devStatusPreviewMode : "none"),
      [data, devStatusPreviewMode, isDevToolsEnabled]
   );
   const errorDetail = useMemo(() => {
      if (!error) {
         return "";
      }

      if (error.isAuthRelated && tokenSettings?.hasCustomToken) {
         return `${error.detail} Your custom bearer token might be expired or pasted wrong. Settings is the place to poke it.`;
      }

      return error.detail;
   }, [error, tokenSettings?.hasCustomToken]);

   useEffect(() => {
      ensureFontAwesomeKit();
   }, []);

   useEffect(() => {
      let isStale = false;

      fetchOsirisTokenSettings()
         .then((settings) => {
            if (!isStale) {
               setTokenSettings(settings);
            }
         })
         .catch((requestError: unknown) => {
            if (!isStale) {
               setTokenSettings({ hasCustomToken: false, hasBearerToken: false });
               notifyError(requestError, "Failed to load bearer token settings.");
            }
         })
         .finally(() => {
            if (!isStale) {
               setIsTokenSettingsLoading(false);
            }
         });

      return () => {
         isStale = true;
      };
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
      if (!IS_DEV_SERVER) {
         return;
      }

      window.localStorage.setItem(DEVTOOLS_STATUS_PREVIEW_STORAGE_KEY, devStatusPreviewMode);
   }, [devStatusPreviewMode]);

   useEffect(() => {
      if (!error?.isAuthRelated) {
         return;
      }

      let isStale = false;
      fetchOsirisTokenSettings()
         .then((settings) => {
            if (!isStale) {
               setTokenSettings(settings);
            }
         })
         .catch(() => {
            if (!isStale) {
               setTokenSettings((current) => (current ? { ...current, hasCustomToken: false } : current));
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

   const positionedLessons = useMemo(() => (displayedData ? getPositionedLessons(displayedData.lessons) : []), [displayedData]);

   const dayGroups = useMemo(() => (displayedData ? getDayGroups(displayedData.week, positionedLessons) : []), [displayedData, positionedLessons]);
   const blankWeek = useMemo(() => getBlankRosterWeek(weekOffset, perceivedNow), [perceivedNow, weekOffset]);
   const blankDayGroups = useMemo(() => getDayGroups(blankWeek, []), [blankWeek]);
   const blankExpandedDays = useMemo(
      () => getDefaultExpandedDays(blankDayGroups, blankWeek.offset, perceivedNow),
      [blankDayGroups, blankWeek.offset, perceivedNow]
   );

   const autoExpandedDays = useMemo(() => {
      if (!displayedData) {
         return new Set<string>();
      }

      return getDefaultExpandedDays(dayGroups, displayedData.week.offset, perceivedNow);
   }, [displayedData, dayGroups, perceivedNow]);

   const expandedDays = useMemo(() => {
      if (!displayedData) {
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
   }, [autoExpandedDays, expandedOverrides, displayedData]);

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
      if (!displayedData || !selectedLessonId) {
         return null;
      }

      return displayedData.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
   }, [displayedData, selectedLessonId]);

   const ignoreBlankDayToggle = useCallback((_dayKey: string) => undefined, []);

   const ignoreBlankLessonSelection = useCallback((_lesson: Lesson) => undefined, []);

   const selectLesson = useCallback((lesson: Lesson) => {
      setIsSettingsOpen(false);
      setSelectedLessonId(lesson.id);
   }, []);

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
      setSelectedLessonId(null);
      setIsSettingsOpen(true);
   }, []);

   const submitBearerToken = useCallback(async () => {
      const nextToken = bearerTokenInput.trim();
      if (!nextToken) {
         return;
      }

      setIsSavingBearerToken(true);

      try {
         const settings = await saveOsirisToken(nextToken);
         window.localStorage.removeItem(CURRENT_WEEK_CACHE_KEY);
         setTokenSettings(settings);
         setBearerTokenInput("");
         notifySuccess("Osiris token saved successfully.");
      } catch (requestError) {
         notifyError(requestError, "Failed to save Osiris token.");
      } finally {
         setIsSavingBearerToken(false);
      }
   }, [bearerTokenInput]);

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

   const hasDisplayedData = Boolean(displayedData);
   const visibleDayGroups = displayedData ? dayGroups : blankDayGroups;
   const visibleExpandedDays = displayedData ? expandedDays : blankExpandedDays;
   const isVisuallyEmptyWeek = displayedData ? displayedData.lessons.length === 0 : true;
   const hasBlockingTokenState = isTokenSettingsLoading ? !hasDisplayedData : !hasBearerToken;
   const hasOverlayUnderlay = hasBlockingTokenState || loading || (Boolean(error) && !data) || isVisuallyEmptyWeek;
   const visibleGridZoom = hasOverlayUnderlay ? "hour" : gridZoom;
   const frameGridZoom = viewMode === "grid" ? visibleGridZoom : gridZoom;
   const overlay = isTokenSettingsLoading && !hasDisplayedData ? (
      <LoadingState message="Checking bearer token." />
   ) : !isTokenSettingsLoading && !hasBearerToken ? (
      <BearerTokenState token={bearerTokenInput} isSaving={isSavingBearerToken} onTokenChange={setBearerTokenInput} onSubmit={() => void submitBearerToken()} />
   ) : loading ? (
      <LoadingState message="Fetching week data." />
   ) : error && !data ? (
      <ErrorState title={error.title} detail={errorDetail} log={error.log} retryCountdownMs={retryCountdownMs} isRetrying={retrying} />
   ) : displayedData?.lessons.length === 0 ? (
      <EmptyWeekState week={displayedData.week} />
   ) : null;

   return (
      <div className="shell">
         <div className="mobile-bottom-bar">
            <AppToolbar
               viewMode={viewMode}
               gridZoom={gridZoom}
               isRefreshing={refreshing || retrying || (isTokenSettingsLoading && hasDisplayedData)}
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
            <section
               className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${frameGridZoom} view-enter`}
               data-empty-week={isVisuallyEmptyWeek}
               data-roster-underlay={hasOverlayUnderlay ? "overlay" : "live"}
               data-week-transition={weekTransitionDirection}
               onAnimationEnd={handleWeekTransitionEnd}
               key={`${viewMode}-${weekOffset}`}
            >
               {viewMode === "agenda" ? (
                  <AgendaView
                     groups={visibleDayGroups}
                     expandedDays={visibleExpandedDays}
                     animate={displayedData ? animateAgenda : false}
                     now={perceivedNow}
                     onToggleDay={displayedData ? toggleDay : ignoreBlankDayToggle}
                     onSelectLesson={displayedData ? selectLesson : ignoreBlankLessonSelection}
                  />
               ) : (
                  <GridView
                     groups={visibleDayGroups}
                     zoom={visibleGridZoom}
                     now={perceivedNow}
                     onSelectLesson={displayedData ? selectLesson : ignoreBlankLessonSelection}
                  />
               )}
               {overlay}
            </section>
         </main>

         <LessonDrawer lesson={selectedLesson} onClose={() => setSelectedLessonId(null)} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            isDevToolsEnabled={isDevToolsEnabled}
            perceivedNow={perceivedNow}
            timeOverride={timeOverride}
            statusPreviewMode={devStatusPreviewMode}
            onClose={() => setIsSettingsOpen(false)}
            onToggleDevTools={toggleDevTools}
            onChangeTimeOverride={changeTimeOverride}
            onChangeStatusPreviewMode={setDevStatusPreviewMode}
         />
      </div>
   );
}
