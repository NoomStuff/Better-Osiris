import { useCallback, useEffect, useRef, useState } from "react";
import { onSessionInvalidated } from "../lib/sessionStore";
import type { WeekRepositoryOptions } from "../lib/weekRepository";
import { formatWeekLabel } from "../lib/weekPolicy";
import { useWeeks } from "./useWeeks";

export type WeekTransitionDirection = "default" | "previous" | "next" | "settled";

/**
 * Owns which week is shown and every way of moving between weeks: buttons, shortcuts, the
 * chooser, startup Home seeking and session resets. `onNavigate` runs on each user-visible move.
 */
export function useWeekNavigation(options: WeekRepositoryOptions, onNavigate: () => void) {
   const [weekOffset, setWeekOffset] = useState(0);
   const weekOffsetRef = useRef(0);
   const [transition, setTransition] = useState<WeekTransitionDirection>("default");
   const [seekingHome, setSeekingHome] = useState(true);
   // Bumped whenever Home is applied, so the agenda re-applies its automatic folding.
   const [homeRevision, setHomeRevision] = useState(0);
   const weeks = useWeeks(weekOffset, options);
   const { homeWeekOffset, homePendingOffset, previousWeekOffset, nextWeekOffset, isWeekNavigable, loading, title } = weeks;

   const selectWeek = useCallback(
      (next: number, direction: WeekTransitionDirection = "default") => {
         setSeekingHome(false);
         if (next === weekOffsetRef.current) return false;
         weekOffsetRef.current = next;
         /* Week changes play the .view-enter animation on the frame itself, under the toolbar. The
            View Transition snapshot system is parked: its top layer covered the mobile toolbar on
            every real browser and no layering or containment trick fixed it. Restoring the
            startViewTransition branch from git history brings the overlap back with it. */
         setTransition(direction);
         setWeekOffset(next);
         onNavigate();
         return true;
      },
      [onNavigate]
   );

   const showHome = useCallback(
      (offset: number) => {
         selectWeek(offset);
         setHomeRevision((revision) => revision + 1);
      },
      [selectWeek]
   );

   useEffect(() => {
      if (!seekingHome) return;
      const target = homeWeekOffset ?? homePendingOffset;
      if (target === null) return;
      const timer = window.setTimeout(() => {
         if (homeWeekOffset !== null) {
            showHome(target);
         } else {
            // Follow the week being checked, without treating it as a user selection.
            weekOffsetRef.current = target;
            setWeekOffset(target);
         }
      }, 0);
      return () => window.clearTimeout(timer);
   }, [seekingHome, homeWeekOffset, homePendingOffset, showHome]);

   useEffect(
      () =>
         onSessionInvalidated(() => {
            onNavigate();
            selectWeek(0);
            setSeekingHome(true);
         }),
      [onNavigate, selectWeek]
   );

   const goPreviousWeek = useCallback(
      () => (previousWeekOffset === null ? false : selectWeek(previousWeekOffset, "previous")),
      [previousWeekOffset, selectWeek]
   );
   const goNextWeek = useCallback(() => (nextWeekOffset === null ? false : selectWeek(nextWeekOffset, "next")), [nextWeekOffset, selectWeek]);
   const goHome = useCallback(() => {
      onNavigate();
      if (homeWeekOffset === null) setSeekingHome(true);
      else showHome(homeWeekOffset);
   }, [homeWeekOffset, onNavigate, showHome]);
   const goToWeek = useCallback(
      (target: number, direction: WeekTransitionDirection = "default") => {
         if (isWeekNavigable(target)) selectWeek(target, direction);
      },
      [isWeekNavigable, selectWeek]
   );

   const [announcement, setAnnouncement] = useState("");
   const lastAnnouncedWeek = useRef<string | null>(null);
   useEffect(() => {
      if (loading) return;
      const key = `${weekOffset}:${title}`;
      const isFirstOrRepeat = lastAnnouncedWeek.current === null || lastAnnouncedWeek.current === key;
      lastAnnouncedWeek.current = key;
      if (!isFirstOrRepeat) setAnnouncement(`${formatWeekLabel(weekOffset)}, ${title}`);
   }, [loading, title, weekOffset]);

   return { ...weeks, weekOffset, transition, setTransition, homeRevision, announcement, selectWeek, goPreviousWeek, goNextWeek, goHome, goToWeek };
}
