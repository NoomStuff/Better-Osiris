import { onSessionInvalidated } from "./lib/sessionStore";
import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type CSSProperties } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { ClassDrawer } from "./components/ClassDrawer";
import { HiddenDaysWarning } from "./components/HiddenDaysWarning";
import { HiddenGridHoursWarning } from "./components/HiddenGridHoursWarning";
import { WarningBanner } from "./components/WarningBanner";
import { Button } from "./components/Button";
import { BearerTokenState, ErrorState, LoadingState, WeekOverlayState } from "./components/LoadingState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { useDevPreview } from "./hooks/useDevPreview";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useAgendaState } from "./hooks/useAgendaState";
import { useAgendaFoldingPreference } from "./hooks/useAgendaFoldingPreference";
import { useClassNotificationsPreference } from "./hooks/useClassNotificationsPreference";
import { useOsirisTokenSettings } from "./hooks/useOsirisTokenSettings";
import { useRosterTimeZone } from "./hooks/useRosterTimeZone";
import { useDockedMobileBar } from "./hooks/useDockedMobileBar";
import { useShownWeekdaysPreference } from "./hooks/useShownWeekdaysPreference";
import { useGridHoursPreference } from "./hooks/useGridHoursPreference";
import { getPerceivedDay, useWeekDays } from "./hooks/useWeekDays";
import { useThemePreference } from "./hooks/useThemePreference";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useViewModePreference } from "./hooks/useViewModePreference";
import { useWeekSwipeNavigation } from "./hooks/useWeekSwipeNavigation";
import { applyDevClassStatusPreview } from "./lib/devStatusPreview";
import { useWeeks } from "./hooks/useWeeks";
import { dayLabel, getIsoWeekday, toDayKey } from "./lib/date";
import { getEmptyWeekMessage } from "./lib/flavor";
import { getHiddenDaysWithClasses, getWeekdaysWithClasses } from "./lib/weekLayout";
import { countClassesOutsideGridHours, getRequiredGridHours, getSmartGridHours, mergeGridHourRanges } from "./lib/gridHours";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useTokenValidation } from "./hooks/useTokenValidation";
import type { GridZoom, Class, WeekMeta, ViewMode } from "./types/weeks";
import "./styles/App.css";

type WeekTransitionDirection = "default" | "previous" | "next" | "settled";
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

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
   const [gridHours, setGridHours] = useGridHoursPreference();
   const [agendaFoldingMode, setAgendaFoldingMode] = useAgendaFoldingPreference();
   const appContentRef = useRef<HTMLElement>(null);
   const weekOffsetRef = useRef(0);
   const [seekingHome, setSeekingHome] = useState(true);
   const isBarDocked = useDockedMobileBar(appContentRef);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [bearerTokenInput, setBearerTokenInput] = useState("");
   const devPreview = useDevPreview();
   const classNotifications = useClassNotificationsPreference();
   const rosterTimeZone = useRosterTimeZone();
   const {
      settings: tokenSettings,
      hasBearerToken,
      isInitialLoading: isTokenSettingsLoading,
      initialLoadError: tokenSettingsLoadError,
      isMutating: isTokenMutating,
      weeksResetKey,
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
      homeWeekOffset,
      homePendingOffset,
      previousWeekOffset,
      nextWeekOffset,
      lastSuccessfulResetKey,
      isWeekNavigable,
      weekNotReturned,
      loading,
      retryCountdownMs,
      retrying,
      refreshing,
      refresh,
      title,
   } = useWeeks(weekOffset, {
      enabled: !isTokenSettingsLoading && hasBearerToken && rosterTimeZone.isKnown,
      clearCache: !isTokenSettingsLoading && !hasBearerToken,
      contextId: tokenSettings?.contextId ?? null,
      resetKey: weeksResetKey,
      timeZone: rosterTimeZone.declaredTimeZone,
   });
   const perceivedNow = devPreview.perceivedNow;
   const perceivedDayKey = rosterTimeZone.isKnown ? toDayKey(perceivedNow) : null;
   const perceivedDay = useMemo(() => (perceivedDayKey ? getPerceivedDay(perceivedDayKey) : null), [perceivedDayKey]);
   const displayedData = useMemo(
      () => applyDevClassStatusPreview(data, devPreview.isEnabled ? devPreview.statusPreviewMode : "none"),
      [data, devPreview.isEnabled, devPreview.statusPreviewMode]
   );
   const errorDetail = useMemo(() => {
      if (!error) {
         return "";
      }

      if (error.isAuthRelated && tokenSettings?.hasCustomToken) {
         return "OSIRIS rejected your saved bearer token.";
      }

      return error.detail;
   }, [error, tokenSettings?.hasCustomToken]);

   const tokenValidation = useTokenValidation(hasBearerToken, error, lastSuccessfulResetKey, weeksResetKey);
   const {
      pending: isTokenValidationPending,
      successfulKey: successfulTokenValidationKey,
      status: tokenValidationStatus,
      submit: submitBearerToken,
   } = tokenValidation;
   useEffect(() => {
      if (successfulTokenValidationKey === null) return;
      const timer = window.setTimeout(() => setBearerTokenInput(""), 0);
      return () => window.clearTimeout(timer);
   }, [successfulTokenValidationKey]);

   useEffect(() => {
      if (!error?.isAuthRelated) {
         return;
      }

      void refreshAfterAuthError();
   }, [error?.isAuthRelated, refreshAfterAuthError]);

   const isEmptyWeek = displayedData?.classes.length === 0;
   const hasBlankWeekUnderlay = !displayedData || isEmptyWeek;
   const visibleWeekdays = hasBlankWeekUnderlay ? ALL_WEEKDAYS : shownWeekdays;
   const visibleAgendaFoldingMode = hasBlankWeekUnderlay ? "all" : agendaFoldingMode;
   const { allDays, visibleDays } = useWeekDays(displayedData, weekOffset, perceivedDay, visibleWeekdays);
   const { animateAgenda, collapseAllDays, expandAllDays, resetAgenda, toggleDay, visibleExpandedDays } = useAgendaState(
      visibleDays,
      weekOffset,
      perceivedDay,
      visibleAgendaFoldingMode
   );

   const hiddenDays = useMemo(() => getHiddenDaysWithClasses(allDays, shownWeekdays), [allDays, shownWeekdays]);
   const smartWeekdays = useMemo(() => getWeekdaysWithClasses(initialWeeks), [initialWeeks]);
   const smartGridHours = useMemo(() => getSmartGridHours(initialWeeks), [initialWeeks]);
   const requiredGridHours = useMemo(() => getRequiredGridHours(visibleDays), [visibleDays]);
   const expandedGridHours = useMemo(() => (requiredGridHours ? mergeGridHourRanges(gridHours, requiredGridHours) : null), [gridHours, requiredGridHours]);
   const hiddenGridClassCount = useMemo(() => countClassesOutsideGridHours(visibleDays, gridHours), [gridHours, visibleDays]);

   const showHiddenDays = useCallback(() => {
      setShownWeekdays((current) => [...new Set([...current, ...hiddenDays.map((day) => getIsoWeekday(day.key))])].sort((a, b) => a - b));
   }, [hiddenDays, setShownWeekdays]);

   const showHiddenGridClasses = useCallback(() => {
      if (expandedGridHours) {
         setGridHours(expandedGridHours);
      }
   }, [expandedGridHours, setGridHours]);

   const changeAgendaFoldingMode = useCallback(
      (mode: Parameters<typeof setAgendaFoldingMode>[0]) => {
         setAgendaFoldingMode(mode);
         resetAgenda();
      },
      [resetAgenda, setAgendaFoldingMode]
   );

   const updateWeekOffset = useCallback(
      (updater: number | ((current: number) => number), transitionDirection: WeekTransitionDirection = "default") => {
         setSeekingHome(false);
         const current = weekOffsetRef.current;
         const next = typeof updater === "function" ? updater(current) : updater;

         if (next === current) {
            return;
         }

         weekOffsetRef.current = next;
         /* Week changes play the .view-enter animation on the frame itself, under the toolbar. The
            View Transition snapshot system is parked: its top layer covered the mobile toolbar on
            every real browser and no layering or containment trick fixed it. Restoring the
            startViewTransition branch from git history brings the overlap back with it. */
         setWeekTransitionDirection(transitionDirection);
         setWeekOffset(next);
         setSelectedClassId(null);
         resetAgenda();
      },
      [resetAgenda]
   );

   useEffect(() => {
      if (!seekingHome) return;
      const target = homeWeekOffset ?? homePendingOffset;
      if (target === null) return;
      const timer = window.setTimeout(() => {
         if (homeWeekOffset !== null) {
            updateWeekOffset(target);
            resetAgenda(true);
         } else {
            // Follow the week being checked, without treating it as a user selection.
            weekOffsetRef.current = target;
            setWeekOffset(target);
         }
      }, 0);
      return () => window.clearTimeout(timer);
   }, [seekingHome, homeWeekOffset, homePendingOffset, updateWeekOffset, resetAgenda]);

   useEffect(
      () =>
         onSessionInvalidated(() => {
            setSelectedClassId(null);
            updateWeekOffset(0);
            setSeekingHome(true);
         }),
      [updateWeekOffset]
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
      if (previousWeekOffset === null) {
         return;
      }

      updateWeekOffset(previousWeekOffset, "previous");
   }, [previousWeekOffset, updateWeekOffset]);

   const goNextWeek = useCallback(() => {
      if (nextWeekOffset === null) {
         return;
      }

      updateWeekOffset(nextWeekOffset, "next");
   }, [nextWeekOffset, updateWeekOffset]);

   const handleCurrentWeek = useCallback(() => {
      setSelectedClassId(null);
      if (homeWeekOffset === null) setSeekingHome(true);
      else {
         updateWeekOffset(homeWeekOffset);
         resetAgenda(true);
      }
   }, [homeWeekOffset, resetAgenda, updateWeekOffset]);

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

   useAppKeyboardShortcuts({
      enabled: !isSettingsOpen && selectedClass === null,
      viewMode,
      gridZoom,
      weekOffset,
      canGoPrevious,
      canGoNext,
      isWeekNavigable,
      goPreviousWeek,
      goNextWeek,
      goCurrentWeek: handleCurrentWeek,
      changeViewMode,
      changeGridZoom: setGridZoom,
      expandAllAgenda: expandAllDays,
      collapseAllAgenda: collapseAllDays,
      openSettings,
      goToWeek: (targetOffset, transitionDirection) => {
         if (isWeekNavigable(targetOffset)) updateWeekOffset(targetOffset, transitionDirection);
      },
   });

   const hasDisplayedData = Boolean(displayedData);
   const hasTokenAccessError = Boolean(error?.isAuthRelated && !data);
   const shouldShowTokenEntry = !isTokenSettingsLoading && (!hasBearerToken || isTokenValidationPending || hasTokenAccessError);
   const hasBlockingTokenState = isTokenSettingsLoading ? !hasDisplayedData : shouldShowTokenEntry;
   const hasOverlayUnderlay = hasBlockingTokenState || loading || (Boolean(error) && !data) || hasBlankWeekUnderlay;
   const visibleGridZoom = hasOverlayUnderlay ? "hour" : gridZoom;
   const frameGridZoom = viewMode === "grid" ? visibleGridZoom : gridZoom;
   const gridZoomScale = visibleGridZoom === "hour" ? 1 : visibleGridZoom === "half" ? 2 : 4;
   const frameStyle = {
      "--grid-min-height": `${(gridHours[1] - gridHours[0]) * 52 * gridZoomScale}px`,
   } as CSSProperties;

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
               onRetry={rosterTimeZone.retry}
            />
         );
      }
      if (isTokenSettingsLoading && !hasDisplayedData) {
         return <LoadingState message={tokenSettingsLoadError ? "Waiting for the roster server." : "Checking bearer token."} />;
      }
      if (shouldShowTokenEntry) {
         const tokenStatus = tokenValidationStatus === "ready" ? "required" : tokenValidationStatus;
         return (
            <BearerTokenState
               token={bearerTokenInput}
               status={tokenStatus}
               onTokenChange={(token) => {
                  setBearerTokenInput(token);
                  tokenValidation.clearFailure();
               }}
               onSubmit={() => void submitBearerToken(bearerTokenInput)}
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
      if (weekNotReturned && !displayedData) {
         return (
            <WeekOverlayState
               title="Week not returned"
               detail="OSIRIS did not include this week in its latest response."
               icon="fa-solid fa-triangle-exclamation"
               role="status"
            >
               <Button onClick={refresh}>Try again</Button>
            </WeekOverlayState>
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
               homeWeekOffset={homeWeekOffset}
               onPreviousWeek={goPreviousWeek}
               onNextWeek={goNextWeek}
               onCurrentWeek={handleCurrentWeek}
               canGoPrevious={canGoPrevious}
               canGoNext={canGoNext}
            />
         </div>

         <main className="app-content" ref={appContentRef}>
            {error && displayedData ? (
               <WarningBanner
                  icon="fa-solid fa-cloud-arrow-down"
                  action={error.isAuthRelated ? { label: "Replace token", onClick: openSettings } : { label: "Try again", onClick: refresh }}
               >
                  Fetching your latest roster went wrong: {errorDetail}
               </WarningBanner>
            ) : null}
            {weekNotReturned && displayedData && !error ? (
               <WarningBanner icon="fa-solid fa-cloud-arrow-down" action={{ label: "Try again", onClick: refresh }}>
                  OSIRIS did not include this week in its latest response. Showing your saved roster.
               </WarningBanner>
            ) : null}
            {hiddenDays.length > 0 ? <HiddenDaysWarning labels={hiddenDays.map((day) => dayLabel.format(day.date))} onShow={showHiddenDays} /> : null}
            {viewMode === "grid" && expandedGridHours && hiddenGridClassCount > 0 ? (
               <HiddenGridHoursWarning count={hiddenGridClassCount} targetRange={expandedGridHours} onShow={showHiddenGridClasses} />
            ) : null}

            <section
               className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${frameGridZoom} view-enter`}
               data-blank-week-underlay={hasBlankWeekUnderlay}
               data-roster-underlay={hasOverlayUnderlay ? "overlay" : "live"}
               data-week-transition={weekTransitionDirection}
               onAnimationEnd={handleWeekTransitionEnd}
               style={frameStyle}
               key={`${viewMode}-${weekOffset}`}
            >
               {rosterTimeZone.isKnown && viewMode === "agenda" ? (
                  <ErrorBoundary variant="view">
                     <AgendaView
                        days={visibleDays}
                        expandedDays={visibleExpandedDays}
                        animate={animateAgenda}
                        now={perceivedNow}
                        timeOverride={devPreview.isEnabled ? devPreview.timeOverride : null}
                        onToggleDay={toggleDay}
                        onSelectClass={selectClass}
                     />
                  </ErrorBoundary>
               ) : rosterTimeZone.isKnown ? (
                  <ErrorBoundary variant="view">
                     <GridView days={visibleDays} hours={gridHours} zoom={visibleGridZoom} now={perceivedNow} onSelectClass={selectClass} />
                  </ErrorBoundary>
               ) : null}
               {overlay}
            </section>
         </main>

         <ClassDrawer schoolClass={selectedClass} onClose={closeClass} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            onClose={closeSettings}
            notifications={{
               areNotificationsBlocked: classNotifications.isBlocked,
               areNotificationsEnabled: classNotifications.enabled,
               areNotificationsSupported: classNotifications.isSupported,
               areNotificationsUpdating: classNotifications.isUpdating,
               onChangeNotifications: (enabled) => void classNotifications.setEnabled(enabled),
            }}
            preferences={{
               theme: theme,
               shownWeekdays: shownWeekdays,
               smartWeekdays: smartWeekdays,
               isSmartDaysReady: areInitialWeeksLoaded,
               gridHours: gridHours,
               smartGridHours: smartGridHours,
               agendaFoldingMode: agendaFoldingMode,
               tokenValidationStatus: tokenValidationStatus,
               onChangeTheme: setTheme,
               onChangeShownWeekdays: setShownWeekdays,
               onChangeGridHours: setGridHours,
               onChangeAgendaFoldingMode: changeAgendaFoldingMode,
            }}
            access={{
               tokenSettings: tokenSettings,
               isTokenLoading: isTokenMutating,
               successfulTokenValidationKey: successfulTokenValidationKey,
               onTokenDraftChange: () => tokenValidation.clearFailure(),
               onSaveToken: submitBearerToken,
               onClearToken: clearToken,
            }}
            preview={{
               isDevToolsEnabled: devPreview.isEnabled,
               perceivedNow: perceivedNow,
               timeOverride: devPreview.timeOverride,
               statusPreviewMode: devPreview.statusPreviewMode,
               onToggleDevTools: devPreview.toggle,
               onChangeTimeOverride: devPreview.changeTimeOverride,
               onChangeStatusPreviewMode: devPreview.setStatusPreviewMode,
            }}
         />
      </div>
   );
}
