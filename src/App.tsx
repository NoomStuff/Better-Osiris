import { useCallback, useEffect, useMemo, useState, type AnimationEvent } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { BearerTokenState, ErrorState, LoadingState, RosterOverlayState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { useDevRosterPreview } from "./hooks/useDevRosterPreview";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { getPerceivedDay, useAgendaState } from "./hooks/useAgendaState";
import { useOsirisTokenSettings } from "./hooks/useOsirisTokenSettings";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useViewModePreference } from "./hooks/useViewModePreference";
import { useWeekSwipeNavigation } from "./hooks/useWeekSwipeNavigation";
import { getAdjacentGridZoom, GRID_ZOOM_ORDER } from "./lib/appView";
import { applyDevLessonStatusPreview } from "./lib/devRosterStatusPreview";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/rosterFlavor";
import { notifyError, notifySuccess } from "./lib/notyf";
import { requestRosterNotificationPermission } from "./lib/rosterNotifications";
import type { GridZoom, Lesson, RosterWeek, ViewMode } from "./types/roster";
import "./styles/App.css";

const IS_DEV_SERVER = import.meta.env.DEV;

type WeekTransitionDirection = "default" | "previous" | "next" | "settled";

function EmptyWeekState({ week }: { week: RosterWeek }) {
   const message = getEmptyWeekMessage(week.start);

   return <RosterOverlayState icon={message.icon} title={message.title} detail={message.detail} />;
}

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [weekTransitionDirection, setWeekTransitionDirection] = useState<WeekTransitionDirection>("default");
   const [viewMode, setViewMode] = useViewModePreference();
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
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
   const perceivedDay = useMemo(() => getPerceivedDay(perceivedDayKey), [perceivedDayKey]);
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

   const { animateAgenda, collapseAllDays, expandAllDays, resetAgenda, toggleDay, visibleDayGroups, visibleExpandedDays } = useAgendaState(
      displayedData,
      weekOffset,
      perceivedDay
   );

   const updateWeekOffset = useCallback(
      (updater: number | ((current: number) => number), transitionDirection: WeekTransitionDirection = "default") => {
         const next = typeof updater === "function" ? updater(weekOffset) : updater;

         if (next === weekOffset) {
            return;
         }

         setWeekTransitionDirection(transitionDirection);
         setWeekOffset(next);
         setSelectedLessonId(null);
         resetAgenda();
      },
      [resetAgenda, weekOffset]
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
         resetAgenda(true);
         return;
      }

      if (!isWeekNavigable(0)) {
         return;
      }

      updateWeekOffset(0);
   }, [isWeekNavigable, resetAgenda, updateWeekOffset, weekOffset]);

   useWeekSwipeNavigation(!isSettingsOpen && selectedLesson === null, goPreviousWeek, goNextWeek);

   const handleWeekTransitionEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target) {
         return;
      }

      setWeekTransitionDirection("settled");
   }, []);

   const changeViewMode = useCallback(
      (nextViewMode: ViewMode) => {
         setWeekTransitionDirection("default");
         setViewMode(nextViewMode);
      },
      [setViewMode]
   );

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
               collapseAllDays();
            }
            return;
         }

         setGridZoom((current) => {
            return getAdjacentGridZoom(current, direction);
         });
      },
      [collapseAllDays, expandAllDays, viewMode]
   );

   const selectToolbarAction = useCallback(
      (actionNumber: number) => {
         if (viewMode === "agenda") {
            if (actionNumber === 1) {
               expandAllDays();
            } else if (actionNumber === 2) {
               collapseAllDays();
            }
            return;
         }

         const nextZoom = GRID_ZOOM_ORDER[actionNumber - 1];
         if (nextZoom) {
            setGridZoom(nextZoom);
         }
      },
      [collapseAllDays, expandAllDays, viewMode]
   );

   useAppKeyboardShortcuts({
      enabled: !isSettingsOpen && selectedLesson === null,
      viewMode,
      gridZoom,
      canGoPrevious,
      canGoNext,
      isWeekNavigable,
      goPreviousWeek,
      goNextWeek,
      goCurrentWeek: handleCurrentWeek,
      changeViewMode,
      openSettings,
      moveToolbarAction,
      selectToolbarAction,
      goToWeek: (targetOffset) => {
         if (isWeekNavigable(targetOffset)) updateWeekOffset(targetOffset);
      },
   });

   const hasDisplayedData = Boolean(displayedData);
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
         <ErrorState
            title={error.title}
            detail={errorDetail}
            log={error.log}
            retryCountdownMs={retryCountdownMs}
            isRetrying={retrying}
            canRetry={error.retryable}
         />
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
               onCollapseAllAgenda={collapseAllDays}
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
