import { checkSessionAfterAuthError, retrySessionSettings } from "./lib/sessionStore";
import { useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type CSSProperties } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppToolbar } from "./components/AppToolbar";
import { GridView } from "./components/GridView";
import { ClassDrawer } from "./components/ClassDrawer";
import { HiddenDaysWarning, HiddenGridHoursWarning, SyncWarning } from "./components/WarningBanner";
import { WeekContentState } from "./components/WeekContentState";
import { SettingsDialog } from "./components/SettingsDialog";
import { WeekNavigator } from "./components/WeekNavigator";
import { WeekDatePicker } from "./components/WeekDatePicker";
import { NextUpCard } from "./components/NextUpCard";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { getNextClassDay } from "./lib/agendaPolicy";
import { useAgendaState } from "./hooks/useAgendaState";
import { useOsirisTokenSettings } from "./hooks/useOsirisTokenSettings";
import { usePreferences } from "./hooks/preferences";
import { useRosterTimeZone } from "./hooks/useRosterTimeZone";
import { useDockedMobileBar } from "./hooks/useDockedMobileBar";
import { booleanCodec, usePersistentState } from "./hooks/usePersistentState";
import { useWeekDays } from "./hooks/useWeekDays";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useWeekScrollRestoration } from "./hooks/useWeekScrollRestoration";
import { useWeekSwipeNavigation } from "./hooks/useWeekSwipeNavigation";
import { applyDevClassStatusPreview } from "./lib/devStatusPreview";
import { useGridZoom } from "./hooks/useGridZoom";
import { useWeekNavigation } from "./hooks/useWeekNavigation";
import { useClock } from "./hooks/useClock";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { dayLabel, getLocalWeekStartIso, getIsoWeekday, parseIsoDateToLocal, toDayKey } from "./lib/date";
import { getDisplayedWeekdays, getHiddenDaysWithClasses, getWeekdaysWithClasses } from "./lib/weekLayout";
import { countClassesOutsideGridHours, getRequiredGridHours, getSmartGridHours, mergeGridHourRanges } from "./lib/gridHours";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useTokenValidation } from "./hooks/useTokenValidation";
import type { Class, ViewMode } from "./types/weeks";
import "./styles/App.css";

type AppOverlay = { kind: "class"; id: string } | { kind: "settings" } | { kind: "week" } | null;

export default function App() {
   const { agendaFoldingMode, devPreview, gridHours, setGridHours, setShownWeekdays, setViewMode, shownWeekdays, viewMode } = usePreferences();
   const appContentRef = useRef<HTMLElement>(null);
   const isBarDocked = useDockedMobileBar(appContentRef);
   const { gridZoom, animateGridHeight, changeGridZoom, handleGridHeightTransitionEnd } = useGridZoom(viewMode);
   const [overlay, setOverlay] = useState<AppOverlay>(null);
   const selectedClassId = overlay?.kind === "class" ? overlay.id : null;
   const isSettingsOpen = overlay?.kind === "settings";
   const clearClassSelection = useCallback(() => setOverlay((current) => (current?.kind === "class" ? null : current)), []);
   const [bearerTokenInput, setBearerTokenInput] = useState("");
   const [nextUpOpen, setNextUpOpen] = usePersistentState("roster-next-up-open", booleanCodec);
   const timeOverride = devPreview.isEnabled ? devPreview.timeOverride : null;
   const statusPreviewMode = devPreview.isEnabled ? devPreview.statusPreviewMode : "none";
   const perceivedNow = useClock(60_000, timeOverride);
   const isOnline = useOnlineStatus();
   const rosterTimeZone = useRosterTimeZone();
   const {
      settings: tokenSettings,
      hasBearerToken,
      isInitialLoading: isTokenSettingsLoading,
      initialLoadError: tokenSettingsLoadError,
      weeksResetKey,
      verifiedBatch,
   } = useOsirisTokenSettings();
   useViewportMetrics();
   const {
      areInitialWeeksLoaded,
      canGoNext,
      canGoPrevious,
      data,
      fetchedAt,
      error,
      initialWeeks,
      knownWeeks,
      homeWeekOffset,
      lastSuccessfulResetKey,
      isWeekNavigable,
      weekNotReturned,
      loading,
      retryAt,
      retrying,
      refreshing,
      refresh,
      title,
      weekOffset,
      transition: weekTransitionDirection,
      setTransition: setWeekTransitionDirection,
      homeRevision,
      announcement: weekAnnouncement,
      selectWeek,
      goPreviousWeek,
      goNextWeek,
      goHome,
      goToWeek,
   } = useWeekNavigation(
      {
         enabled: !isTokenSettingsLoading && hasBearerToken && rosterTimeZone.isKnown,
         clearCache: !isTokenSettingsLoading && !hasBearerToken,
         contextId: tokenSettings?.contextId ?? null,
         resetKey: weeksResetKey,
         verifiedBatch,
         shownWeekdays,
         timeZone: rosterTimeZone.declaredTimeZone,
      },
      clearClassSelection
   );
   const nextClassDay = useMemo(
      () => (rosterTimeZone.isKnown ? getNextClassDay(knownWeeks, perceivedNow) : null),
      [knownWeeks, perceivedNow, rosterTimeZone.isKnown]
   );
   const perceivedDayKey = rosterTimeZone.isKnown ? toDayKey(perceivedNow) : null;
   const perceivedDay = useMemo(() => (perceivedDayKey ? parseIsoDateToLocal(perceivedDayKey) : null), [perceivedDayKey]);
   const displayedData = useMemo(() => applyDevClassStatusPreview(data, statusPreviewMode), [data, statusPreviewMode]);
   useWeekScrollRestoration(`${viewMode}-${weekOffset}`, displayedData !== null);
   const nextUpWeeks = useMemo(
      () => (statusPreviewMode === "none" ? knownWeeks : knownWeeks.flatMap((week) => applyDevClassStatusPreview(week, statusPreviewMode) ?? [])),
      [knownWeeks, statusPreviewMode]
   );
   const errorDetail = useMemo(() => {
      if (!error) {
         return "";
      }

      if (error.isAuthRelated && tokenSettings?.hasCustomToken) {
         return error.savedTokenExpired ? "OSIRIS rejected your saved bearer token. It likely expired." : "OSIRIS rejected your saved bearer token.";
      }

      return error.detail;
   }, [error, tokenSettings?.hasCustomToken]);

   const {
      pending: isTokenValidationPending,
      successfulKey: successfulTokenValidationKey,
      status: tokenValidationStatus,
      submit: submitBearerToken,
      clearFailure: clearTokenValidationFailure,
   } = useTokenValidation(hasBearerToken, error, lastSuccessfulResetKey, weeksResetKey);
   useEffect(() => {
      if (successfulTokenValidationKey === null) return;
      const timer = window.setTimeout(() => setBearerTokenInput(""), 0);
      return () => window.clearTimeout(timer);
   }, [successfulTokenValidationKey]);

   useEffect(() => {
      if (error?.isAuthRelated) void checkSessionAfterAuthError();
   }, [error?.isAuthRelated]);

   const isEmptyWeek = displayedData?.classes.length === 0;
   const hasBlankWeekUnderlay = !displayedData || isEmptyWeek;
   const visibleWeekdays = getDisplayedWeekdays(displayedData, shownWeekdays);
   const visibleAgendaFoldingMode = hasBlankWeekUnderlay && agendaFoldingMode !== "single" ? "all" : agendaFoldingMode;
   const { allDays, visibleDays } = useWeekDays(displayedData, weekOffset, perceivedDay, visibleWeekdays);
   const { animateAgenda, collapseAllDays, expandAllDays, toggleDay, visibleExpandedDays } = useAgendaState(
      visibleDays,
      perceivedDay,
      visibleAgendaFoldingMode,
      weekOffset === homeWeekOffset,
      nextClassDay,
      { weekOffset, homeRevision, foldingPreference: agendaFoldingMode }
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

   const selectedClass: Class | null = useMemo(() => {
      if (!selectedClassId) {
         return null;
      }

      // The next-up card can point at a class outside the week being viewed, so fall back to every cached week.
      return (
         displayedData?.classes.find((schoolClass) => schoolClass.id === selectedClassId) ??
         nextUpWeeks.flatMap((week) => week.classes).find((schoolClass) => schoolClass.id === selectedClassId) ??
         null
      );
   }, [displayedData, nextUpWeeks, selectedClassId]);

   const selectClass = useCallback((schoolClass: Class) => {
      setOverlay({ kind: "class", id: schoolClass.id });
   }, []);

   const hasOpenOverlay = overlay?.kind === "class" ? selectedClass !== null : overlay !== null;
   useWeekSwipeNavigation(appContentRef, !hasOpenOverlay, goPreviousWeek, goNextWeek);

   const handleWeekTransitionEnd = useCallback(
      (event: AnimationEvent<HTMLElement>) => {
         if (event.currentTarget === event.target) setWeekTransitionDirection("settled");
      },
      [setWeekTransitionDirection]
   );

   const changeViewMode = useCallback(
      (nextViewMode: ViewMode) => {
         setWeekTransitionDirection("default");
         setViewMode(nextViewMode);
      },
      [setViewMode, setWeekTransitionDirection]
   );

   const openSettings = useCallback(() => {
      setOverlay({ kind: "settings" });
   }, []);

   const closeOverlay = useCallback(() => setOverlay(null), []);

   useAppKeyboardShortcuts({
      enabled: !hasOpenOverlay,
      viewMode,
      gridZoom,
      weekOffset,
      canGoPrevious,
      canGoNext,
      isWeekNavigable,
      goPreviousWeek,
      goNextWeek,
      goCurrentWeek: goHome,
      changeViewMode,
      changeGridZoom,
      expandAllAgenda: expandAllDays,
      collapseAllAgenda: collapseAllDays,
      openSettings,
      goToWeek,
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

   return (
      <div className="shell">
         <div className="mobile-bottom-bar" data-docked={isBarDocked}>
            <AppToolbar
               viewMode={viewMode}
               gridZoom={gridZoom}
               isRefreshing={refreshing || retrying || (isTokenSettingsLoading && hasDisplayedData && !tokenSettingsLoadError)}
               onChangeView={changeViewMode}
               onChangeGridZoom={changeGridZoom}
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
               onCurrentWeek={goHome}
               canGoPrevious={canGoPrevious}
               canGoNext={canGoNext}
               canChooseWeek={rosterTimeZone.isKnown}
               onChooseWeek={() => setOverlay({ kind: "week" })}
            />
         </div>

         <main className="app-content" ref={appContentRef}>
            {(error || !isOnline || tokenSettingsLoadError || rosterTimeZone.configError) && displayedData ? (
               <SyncWarning
                  fetchedAt={fetchedAt}
                  isOnline={isOnline}
                  errorDetail={error ? errorDetail : null}
                  isAuthError={error?.isAuthRelated === true}
                  onReplaceToken={openSettings}
                  onRetry={() => {
                     if (tokenSettingsLoadError) retrySessionSettings();
                     if (rosterTimeZone.configError) rosterTimeZone.retry();
                     if (error) refresh();
                  }}
               />
            ) : null}
            {hiddenDays.length > 0 ? <HiddenDaysWarning labels={hiddenDays.map((day) => dayLabel.format(day.date))} onShow={showHiddenDays} /> : null}
            {viewMode === "grid" && expandedGridHours && hiddenGridClassCount > 0 ? (
               <HiddenGridHoursWarning count={hiddenGridClassCount} targetRange={expandedGridHours} onShow={showHiddenGridClasses} />
            ) : null}

            {/* Floating free of both views: the strip anchors to the content frame's top edge without occupying layout space. */}
            {rosterTimeZone.isKnown ? (
               <NextUpCard weeks={nextUpWeeks} timeOverride={timeOverride} isOpen={nextUpOpen} onChangeOpen={setNextUpOpen} onSelectClass={selectClass} />
            ) : null}

            <section
               className={`app-content-frame app-content-frame--${viewMode} app-content-frame--zoom-${frameGridZoom} view-enter`}
               data-blank-week-underlay={hasBlankWeekUnderlay}
               data-roster-underlay={hasOverlayUnderlay ? "overlay" : "live"}
               data-week-transition={weekTransitionDirection}
               data-zoom-animate={animateGridHeight}
               onAnimationEnd={handleWeekTransitionEnd}
               onTransitionEnd={handleGridHeightTransitionEnd}
               style={frameStyle}
               key={`${viewMode}-${weekOffset}`}
            >
               {rosterTimeZone.isKnown ? (
                  <ErrorBoundary variant="view">
                     {viewMode === "agenda" ? (
                        <AgendaView
                           inert={hasOverlayUnderlay}
                           days={visibleDays}
                           expandedDays={visibleExpandedDays}
                           animate={animateAgenda}
                           now={perceivedNow}
                           timeOverride={timeOverride}
                           onToggleDay={toggleDay}
                           onSelectClass={selectClass}
                        />
                     ) : (
                        <GridView
                           inert={hasOverlayUnderlay}
                           days={visibleDays}
                           hours={gridHours}
                           zoom={visibleGridZoom}
                           now={perceivedNow}
                           onSelectClass={selectClass}
                        />
                     )}
                  </ErrorBoundary>
               ) : null}
               <WeekContentState
                  rosterTimeZone={rosterTimeZone}
                  isTokenSettingsLoading={isTokenSettingsLoading}
                  tokenSettingsLoadError={tokenSettingsLoadError}
                  shouldShowTokenEntry={shouldShowTokenEntry}
                  tokenValidationStatus={tokenValidationStatus}
                  bearerTokenInput={bearerTokenInput}
                  onTokenChange={(token) => {
                     setBearerTokenInput(token);
                     clearTokenValidationFailure();
                  }}
                  onTokenSubmit={() => void submitBearerToken(bearerTokenInput)}
                  loading={loading}
                  error={error}
                  errorDetail={errorDetail}
                  retryAt={retryAt}
                  retrying={retrying}
                  refresh={refresh}
                  weekNotReturned={weekNotReturned}
                  displayedData={displayedData}
               />
            </section>
         </main>

         {overlay?.kind === "week" && rosterTimeZone.isKnown ? (
            <WeekDatePicker
               anchor={getLocalWeekStartIso(new Date())}
               selectedOffset={weekOffset}
               isWeekNavigable={isWeekNavigable}
               onClose={closeOverlay}
               onSelect={(offset) => {
                  setOverlay(null);
                  selectWeek(offset, offset < weekOffset ? "previous" : "next");
               }}
            />
         ) : null}
         <ClassDrawer schoolClass={selectedClass} onClose={closeOverlay} />
         <SettingsDialog
            isOpen={isSettingsOpen}
            onClose={closeOverlay}
            onTokenDraftChange={clearTokenValidationFailure}
            onSaveToken={submitBearerToken}
            isSmartDaysReady={areInitialWeeksLoaded}
            smartWeekdays={smartWeekdays}
            smartGridHours={smartGridHours}
            successfulTokenValidationKey={successfulTokenValidationKey}
            tokenValidationStatus={tokenValidationStatus}
         />
         <div role="status" className="visually-hidden">
            {weekAnnouncement}
         </div>
      </div>
   );
}
