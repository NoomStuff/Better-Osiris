import { useCallback, useEffect, useMemo, useState, type AnimationEvent } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { BearerTokenState, ErrorState, LoadingState, RosterOverlayState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { useDevRosterPreview } from "./hooks/useDevRosterPreview";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./hooks/useKeyboardShortcuts";
import { useOsirisTokenSettings } from "./hooks/useOsirisTokenSettings";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useWeekSwipeNavigation } from "./hooks/useWeekSwipeNavigation";
import { APP_SHORTCUTS } from "./lib/appShortcuts";
import { applyDevLessonStatusPreview } from "./lib/devRosterStatusPreview";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { formatLocalIsoDate, getIsoWeekNumber, toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/rosterFlavor";
import { notifyError, notifySuccess } from "./lib/notyf";
import { getDayGroups, getPositionedLessons } from "./lib/rosterLayout";
import { requestRosterNotificationPermission } from "./lib/rosterNotifications";
import type { GridZoom, Lesson, RosterWeek, ViewMode } from "./types/roster";
import "./styles/App.css";

const STORAGE_KEY = "roster-view-mode";
const GRID_ZOOM_ORDER = ["hour", "half", "quarter"] as const satisfies readonly GridZoom[];
const FUTURE_WEEK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const IS_DEV_SERVER = import.meta.env.DEV;
const MOBILE_VIEW_MODE_MEDIA_QUERY = "(max-width: 640px)";

type WeekTransitionDirection = "default" | "previous" | "next" | "settled";

function getInitialViewMode(): ViewMode {
   if (typeof window === "undefined") {
      return "grid";
   }

   const stored = window.localStorage.getItem(STORAGE_KEY);
   if (stored === "agenda" || stored === "grid") {
      return stored;
   }

   return window.matchMedia(MOBILE_VIEW_MODE_MEDIA_QUERY).matches ? "agenda" : "grid";
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
   const message = getEmptyWeekMessage(week.start);

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

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [weekTransitionDirection, setWeekTransitionDirection] = useState<WeekTransitionDirection>("default");
   const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [bearerTokenInput, setBearerTokenInput] = useState("");
   const devPreview = useDevRosterPreview();
   const {
      settings: tokenSettings,
      hasBearerToken,
      isInitialLoading: isTokenSettingsLoading,
      isMutating: isTokenMutating,
      rosterResetKey,
      saveToken,
      clearToken,
      refreshAfterAuthError,
   } = useOsirisTokenSettings();
   useViewportMetrics();
   const { canGoNext, canGoPrevious, data, error, isWeekNavigable, loading, retryCountdownMs, retrying, refreshing, title } = useRosterWeek(weekOffset, {
      enabled: !isTokenSettingsLoading && hasBearerToken,
      clearCache: !isTokenSettingsLoading && !hasBearerToken,
      resetKey: rosterResetKey,
   });
   const perceivedNow = devPreview.perceivedNow;
   const perceivedDayKey = toDayKey(perceivedNow);
   const perceivedDay = useMemo(() => new Date(`${perceivedDayKey}T12:00:00`), [perceivedDayKey]);
   const displayedData = useMemo(
      () => applyDevLessonStatusPreview(data, IS_DEV_SERVER && devPreview.isEnabled ? devPreview.statusPreviewMode : "none"),
      [data, devPreview.isEnabled, devPreview.statusPreviewMode]
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
      requestRosterNotificationPermission();
   }, []);

   useEffect(() => {
      if (!error?.isAuthRelated) {
         return;
      }

      void refreshAfterAuthError();
   }, [error?.isAuthRelated, refreshAfterAuthError]);

   useEffect(() => {
      window.localStorage.setItem(STORAGE_KEY, viewMode);
   }, [viewMode]);

   const positionedLessons = useMemo(() => (displayedData ? getPositionedLessons(displayedData.lessons) : []), [displayedData]);

   const dayGroups = useMemo(() => (displayedData ? getDayGroups(displayedData.week, positionedLessons) : []), [displayedData, positionedLessons]);
   const blankWeek = useMemo(() => getBlankRosterWeek(weekOffset, perceivedDay), [perceivedDay, weekOffset]);
   const blankDayGroups = useMemo(() => getDayGroups(blankWeek, []), [blankWeek]);
   const blankExpandedDays = useMemo(
      () => getDefaultExpandedDays(blankDayGroups, blankWeek.offset, perceivedDay),
      [blankDayGroups, blankWeek.offset, perceivedDay]
   );

   const autoExpandedDays = useMemo(() => {
      if (!displayedData) {
         return new Set<string>();
      }

      return getDefaultExpandedDays(dayGroups, displayedData.week.offset, perceivedDay);
   }, [displayedData, dayGroups, perceivedDay]);

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
      const targetOffset = weekOffset - 1;
      if (!isWeekNavigable(targetOffset)) {
         return;
      }

      updateWeekOffset(targetOffset, "previous");
   }, [isWeekNavigable, updateWeekOffset, weekOffset]);

   const goNextWeek = useCallback(() => {
      const targetOffset = weekOffset + 1;
      if (!isWeekNavigable(targetOffset)) {
         return;
      }

      updateWeekOffset(targetOffset, "next");
   }, [isWeekNavigable, updateWeekOffset, weekOffset]);

   const handleCurrentWeek = useCallback(() => {
      if (weekOffset === 0) {
         setSelectedLessonId(null);
         setAnimateAgenda(true);
         setExpandedOverrides(new Set());
         return;
      }

      if (!isWeekNavigable(0)) {
         return;
      }

      updateWeekOffset(0);
   }, [isWeekNavigable, updateWeekOffset, weekOffset]);

   useWeekSwipeNavigation(!isSettingsOpen && selectedLesson === null, goPreviousWeek, goNextWeek);

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

   const closeLesson = useCallback(() => setSelectedLessonId(null), []);

   const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

   const submitBearerToken = useCallback(async () => {
      const nextToken = bearerTokenInput.trim();
      if (!nextToken) {
         return;
      }

      try {
         await saveToken(nextToken);
         setBearerTokenInput("");
         notifySuccess("Osiris token saved successfully.");
      } catch (requestError) {
         notifyError(requestError, "Failed to save Osiris token.");
      }
   }, [bearerTokenInput, saveToken]);

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
            disabled: !canGoPrevious,
            onPress: goPreviousWeek,
         },
         {
            id: "next-week",
            ...APP_SHORTCUTS.nextWeek,
            activationTargetId: "next-week",
            disabled: !canGoNext,
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
            disabled: !isWeekNavigable(Number(key)),
            onPress: () => {
               const targetOffset = Number(key);
               if (isWeekNavigable(targetOffset)) {
                  updateWeekOffset(targetOffset);
               }
            },
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
         canGoPrevious,
         canGoNext,
         changeViewMode,
         goNextWeek,
         goPreviousWeek,
         gridZoom,
         handleCurrentWeek,
         isWeekNavigable,
         moveToolbarAction,
         openSettings,
         selectToolbarAction,
         updateWeekOffset,
         viewMode,
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
   const overlay =
      isTokenSettingsLoading && !hasDisplayedData ? (
         <LoadingState message="Checking bearer token." />
      ) : !isTokenSettingsLoading && !hasBearerToken ? (
         <BearerTokenState token={bearerTokenInput} isSaving={isTokenMutating} onTokenChange={setBearerTokenInput} onSubmit={() => void submitBearerToken()} />
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
               canGoPrevious={canGoPrevious}
               canGoNext={canGoNext}
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

         <LessonDrawer lesson={selectedLesson} onClose={closeLesson} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            isDevToolsEnabled={devPreview.isEnabled}
            perceivedNow={perceivedNow}
            timeOverride={devPreview.timeOverride}
            statusPreviewMode={devPreview.statusPreviewMode}
            tokenSettings={tokenSettings}
            isTokenLoading={isTokenMutating}
            onSaveToken={saveToken}
            onClearToken={clearToken}
            onClose={closeSettings}
            onToggleDevTools={devPreview.toggle}
            onChangeTimeOverride={devPreview.changeTimeOverride}
            onChangeStatusPreviewMode={devPreview.setStatusPreviewMode}
         />
      </div>
   );
}
