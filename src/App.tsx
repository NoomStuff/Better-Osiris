import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { ClassDrawer } from "./components/ClassDrawer";
import { HiddenDaysWarning } from "./components/HiddenDaysWarning";
import { BearerTokenState, ErrorState, LoadingState, WeekOverlayState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { useDevPreview } from "./hooks/useDevPreview";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { getPerceivedDay, useAgendaState } from "./hooks/useAgendaState";
import { useOsirisTokenSettings } from "./hooks/useOsirisTokenSettings";
import { useRosterTimeZone } from "./hooks/useRosterTimeZone";
import { useDockedMobileBar } from "./hooks/useDockedMobileBar";
import { useShownWeekdaysPreference } from "./hooks/useShownWeekdaysPreference";
import { useThemePreference } from "./hooks/useThemePreference";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useViewModePreference } from "./hooks/useViewModePreference";
import { useWeekSwipeNavigation } from "./hooks/useWeekSwipeNavigation";
import { getAdjacentGridZoom, GRID_ZOOM_ORDER } from "./lib/appView";
import { applyDevClassStatusPreview } from "./lib/devStatusPreview";
import { useWeeks } from "./hooks/useWeeks";
import { dayLabel, getIsoWeekday, toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/flavor";
import { getHiddenDaysWithClasses, getWeekdaysWithClasses } from "./lib/weekLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { notifyError, notifySuccess } from "./lib/notyf";
import { requestNotificationPermission } from "./lib/classNotifications";
import type { GridZoom, Class, WeekMeta, ViewMode } from "./types/weeks";
import "./styles/App.css";

const IS_DEV_SERVER = import.meta.env.DEV;

type WeekTransitionDirection = "default" | "previous" | "next" | "settled";

function EmptyWeekState({ week }: { week: WeekMeta }) {
   const message = getEmptyWeekMessage(week.start);

   return <WeekOverlayState icon={message.icon} title={message.title} detail={message.detail} />;
}

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [weekTransitionDirection, setWeekTransitionDirection] = useState<WeekTransitionDirection>("default");
   const [viewMode, setViewMode] = useViewModePreference();
   const [theme, setTheme] = useThemePreference();
   const [shownWeekdays, setShownWeekdays] = useShownWeekdaysPreference();
   const appContentRef = useRef<HTMLElement>(null);
   const isBarDocked = useDockedMobileBar(appContentRef);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [bearerTokenInput, setBearerTokenInput] = useState("");
   const devPreview = useDevPreview();
   const rosterTimeZone = useRosterTimeZone();
   const {
      settings: tokenSettings,
      hasBearerToken,
      isInitialLoading: isTokenSettingsLoading,
      isMutating: isTokenMutating,
      weeksResetKey,
      saveToken,
      clearToken,
      refreshAfterAuthError,
   } = useOsirisTokenSettings();
   useViewportMetrics();
   const {
      areInitialWeeksLoaded,
      canGoNext,
      canGoPrevious,
      data,
      error,
      initialWeeks,
      isWeekNavigable,
      loading,
      retryCountdownMs,
      retrying,
      refreshing,
      title,
   } = useWeeks(weekOffset, {
      enabled: !isTokenSettingsLoading && hasBearerToken && rosterTimeZone.isKnown,
      clearCache: (!isTokenSettingsLoading && !hasBearerToken) || rosterTimeZone.hasTimeZoneChanged,
      resetKey: weeksResetKey,
   });
   const perceivedNow = devPreview.perceivedNow;
   const perceivedDayKey = rosterTimeZone.isKnown ? toDayKey(perceivedNow) : null;
   const perceivedDay = useMemo(() => (perceivedDayKey ? getPerceivedDay(perceivedDayKey) : null), [perceivedDayKey]);
   const displayedData = useMemo(
      () => applyDevClassStatusPreview(data, IS_DEV_SERVER && devPreview.isEnabled ? devPreview.statusPreviewMode : "none"),
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
      requestNotificationPermission();
   }, []);

   useEffect(() => {
      if (!error?.isAuthRelated) {
         return;
      }

      void refreshAfterAuthError();
   }, [error?.isAuthRelated, refreshAfterAuthError]);

   const { allDays, animateAgenda, collapseAllDays, expandAllDays, resetAgenda, toggleDay, visibleDays, visibleExpandedDays } = useAgendaState(
      displayedData,
      weekOffset,
      perceivedDay,
      shownWeekdays
   );

   const hiddenDays = useMemo(() => getHiddenDaysWithClasses(allDays, shownWeekdays), [allDays, shownWeekdays]);
   const smartWeekdays = useMemo(() => getWeekdaysWithClasses(initialWeeks), [initialWeeks]);

   const showHiddenDays = useCallback(() => {
      setShownWeekdays((current) => [...new Set([...current, ...hiddenDays.map((day) => getIsoWeekday(day.key))])].sort((a, b) => a - b));
   }, [hiddenDays, setShownWeekdays]);

   const updateWeekOffset = useCallback(
      (updater: number | ((current: number) => number), transitionDirection: WeekTransitionDirection = "default") => {
         const next = typeof updater === "function" ? updater(weekOffset) : updater;

         if (next === weekOffset) {
            return;
         }

         setWeekTransitionDirection(transitionDirection);
         setWeekOffset(next);
         setSelectedClassId(null);
         resetAgenda();
      },
      [resetAgenda, weekOffset]
   );

   const selectedClass: Class | null = useMemo(() => {
      if (!displayedData || !selectedClassId) {
         return null;
      }

      return displayedData.classes.find((schoolClass) => schoolClass.id === selectedClassId) ?? null;
   }, [displayedData, selectedClassId]);

   const selectClass = useCallback((schoolClass: Class) => {
      setIsSettingsOpen(false);
      setSelectedClassId(schoolClass.id);
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
         setSelectedClassId(null);
         resetAgenda(true);
         return;
      }

      if (!isWeekNavigable(0)) {
         return;
      }

      updateWeekOffset(0);
   }, [isWeekNavigable, resetAgenda, updateWeekOffset, weekOffset]);

   useWeekSwipeNavigation(!isSettingsOpen && selectedClass === null, goPreviousWeek, goNextWeek);

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
      setSelectedClassId(null);
      setIsSettingsOpen(true);
   }, []);

   const closeClass = useCallback(() => setSelectedClassId(null), []);

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
      enabled: !isSettingsOpen && selectedClass === null,
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
   const isVisuallyEmptyWeek = displayedData ? displayedData.classes.length === 0 : true;
   const hasBlockingTokenState = isTokenSettingsLoading ? !hasDisplayedData : !hasBearerToken;
   const hasOverlayUnderlay = hasBlockingTokenState || loading || (Boolean(error) && !data) || isVisuallyEmptyWeek;
   const visibleGridZoom = hasOverlayUnderlay ? "hour" : gridZoom;
   const frameGridZoom = viewMode === "grid" ? visibleGridZoom : gridZoom;

   const overlay = (() => {
      if (!rosterTimeZone.isKnown) {
         if (rosterTimeZone.isInitialLoading) {
            return <LoadingState message="Checking roster configuration." />;
         }
         return (
            <ErrorState
               title="Roster configuration unavailable"
               detail="The server did not declare which time zone the roster uses, so roster data cannot be interpreted safely."
               log={rosterTimeZone.configError ?? "The roster time zone was not declared."}
               retryCountdownMs={0}
               isRetrying={false}
               canRetry={false}
            />
         );
      }
      if (isTokenSettingsLoading && !hasDisplayedData) {
         return <LoadingState message="Checking bearer token." />;
      }
      if (!isTokenSettingsLoading && !hasBearerToken) {
         return (
            <BearerTokenState
               token={bearerTokenInput}
               isSaving={isTokenMutating}
               onTokenChange={setBearerTokenInput}
               onSubmit={() => void submitBearerToken()}
            />
         );
      }
      if (loading) {
         return <LoadingState message="Fetching week data." />;
      }
      if (error && !data) {
         return (
            <ErrorState
               title={error.title}
               detail={errorDetail}
               log={error.log}
               retryCountdownMs={retryCountdownMs}
               isRetrying={retrying}
               canRetry={error.retryable}
            />
         );
      }
      if (displayedData?.classes.length === 0) {
         return <EmptyWeekState week={displayedData.week} />;
      }
      return null;
   })();

   return (
      <div className="shell">
         <div className="mobile-bottom-bar" data-docked={isBarDocked}>
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

         <main className="app-content" ref={appContentRef}>
            {hiddenDays.length > 0 ? <HiddenDaysWarning labels={hiddenDays.map((day) => dayLabel.format(day.date))} onShow={showHiddenDays} /> : null}

            <section
               className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${frameGridZoom} view-enter`}
               data-empty-week={isVisuallyEmptyWeek}
               data-roster-underlay={hasOverlayUnderlay ? "overlay" : "live"}
               data-week-transition={weekTransitionDirection}
               onAnimationEnd={handleWeekTransitionEnd}
               key={`${viewMode}-${weekOffset}`}
            >
               {rosterTimeZone.isKnown && viewMode === "agenda" ? (
                  <ErrorBoundary variant="view">
                     <AgendaView
                        days={visibleDays}
                        expandedDays={visibleExpandedDays}
                        animate={animateAgenda}
                        now={perceivedNow}
                        onToggleDay={toggleDay}
                        onSelectClass={selectClass}
                     />
                  </ErrorBoundary>
               ) : rosterTimeZone.isKnown ? (
                  <ErrorBoundary variant="view">
                     <GridView days={visibleDays} zoom={visibleGridZoom} now={perceivedNow} onSelectClass={selectClass} />
                  </ErrorBoundary>
               ) : null}
               {overlay}
            </section>
         </main>

         <ClassDrawer schoolClass={selectedClass} onClose={closeClass} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            theme={theme}
            shownWeekdays={shownWeekdays}
            smartWeekdays={smartWeekdays}
            isSmartDaysReady={areInitialWeeksLoaded}
            isDevToolsEnabled={devPreview.isEnabled}
            perceivedNow={perceivedNow}
            timeOverride={devPreview.timeOverride}
            statusPreviewMode={devPreview.statusPreviewMode}
            tokenSettings={tokenSettings}
            isTokenLoading={isTokenMutating}
            onSaveToken={saveToken}
            onClearToken={clearToken}
            onClose={closeSettings}
            onChangeTheme={setTheme}
            onChangeShownWeekdays={setShownWeekdays}
            onToggleDevTools={devPreview.toggle}
            onChangeTimeOverride={devPreview.changeTimeOverride}
            onChangeStatusPreviewMode={devPreview.setStatusPreviewMode}
         />
      </div>
   );
}
