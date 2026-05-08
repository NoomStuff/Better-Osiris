import { useEffect, useMemo, useState } from "react";
import { AgendaView } from "./components/AgendaView";
import { AppHeader } from "./components/AppHeader";
import { GridView } from "./components/GridView";
import { LessonDrawer } from "./components/LessonDrawer";
import { LoadingState } from "./components/LoadingState";
import { WeekNavigator } from "./components/WeekNavigator";
import { useRosterWeek } from "./hooks/useRosterWeek";
import { toDayKey } from "./lib/date";
import { getDayGroups, getPositionedLessons } from "./lib/rosterLayout";
import type { GridZoom, Lesson, ViewMode } from "./types/roster";
import "./styles/App.css";

const STORAGE_KEY = "roster-view-mode";
const MIN_WEEK_OFFSET = 0; // we cant fetch past weeks, so min is 0 (current week)
const MAX_WEEK_OFFSET = 50; // the max we can fetch from the API

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

export default function App() {
   const [weekOffset, setWeekOffset] = useState(0);
   const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
   const [gridZoom, setGridZoom] = useState<GridZoom>("hour");
   const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
   const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
   const [animateAgenda, setAnimateAgenda] = useState(false);
   const { data, error, loading, title } = useRosterWeek(weekOffset);

   useEffect(() => {
      ensureFontAwesomeKit();
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

   const updateWeekOffset = (updater: number | ((current: number) => number)) => {
      setWeekOffset((current) => (typeof updater === "function" ? updater(current) : updater));
      setSelectedLessonId(null);
      setAnimateAgenda(false);
      setExpandedOverrides(new Set());
   };

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

   const expandAllDays = () => {
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
   };

   const closeAllDays = () => {
      if (!data) {
         return;
      }

      setAnimateAgenda(true);
      setExpandedOverrides(() => new Set(autoExpandedDays));
   };

   const handleCurrentWeek = () => {
      if (weekOffset === 0) {
         setSelectedLessonId(null);
         setAnimateAgenda(true);
         setExpandedOverrides(new Set());
         return;
      }

      updateWeekOffset(0);
   };

   return (
      <div className="shell">
         <div className="mobile-bottom-bar">
            <AppHeader
               viewMode={viewMode}
               gridZoom={gridZoom}
               onChangeView={setViewMode}
               onChangeGridZoom={setGridZoom}
               onExpandAllAgenda={expandAllDays}
               onCloseAllAgenda={closeAllDays}
            />

            <WeekNavigator
               title={title}
               weekOffset={weekOffset}
               onPreviousWeek={() => updateWeekOffset((current) => Math.max(current - 1, MIN_WEEK_OFFSET))}
               onNextWeek={() => updateWeekOffset((current) => Math.min(current + 1, MAX_WEEK_OFFSET))}
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
      </div>
   );
}
