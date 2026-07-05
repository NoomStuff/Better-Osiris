import { dayLabel, parseLocalDateTime, timeLabel } from "./date";
import type { SessionLessonDiff } from "./rosterSessionDiffs";

let permissionRequest: Promise<NotificationPermission> | null = null;

export function requestRosterNotificationPermission() {
   if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "default") {
      return;
   }

   permissionRequest ??= window.Notification.requestPermission().catch(() => "default");
}

export function notifyRosterDiffs(diffs: SessionLessonDiff[]) {
   if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") {
      return;
   }

   getRosterNotificationBodies(diffs).forEach((body) => {
      try {
         new window.Notification("Better Osiris", { body });
      } catch {
         // Notification support varies between browsers and operating systems.
      }
   });
}

export function getRosterNotificationBodies(diffs: SessionLessonDiff[]) {
   const cancelled = diffs.filter((diff) => diff.status === "cancelled");
   const changed = diffs.filter((diff) => diff.status === "changed");

   return [formatDiffGroup(cancelled, "cancelled"), formatDiffGroup(changed, "changed")].filter((body): body is string => body !== null);
}

function formatDiffGroup(diffs: SessionLessonDiff[], status: "changed" | "cancelled") {
   const firstDiff = diffs[0];
   if (!firstDiff) {
      return null;
   }

   return diffs.length === 1 ? formatSingleDiff(firstDiff) : `${diffs.length} classes were ${status === "cancelled" ? "cancelled" : "changed"}`;
}

function formatSingleDiff(diff: SessionLessonDiff) {
   const lesson = diff.lesson;
   const previous = diff.previousLesson;

   if (diff.status === "cancelled") {
      const start = parseLocalDateTime(lesson.start);
      return `${lesson.title} was cancelled: ${dayLabel.format(start)} ${timeLabel.format(start)}`;
   }

   const detailChange =
      getTextChange(previous.room, lesson.room) ??
      getTimeChange(previous.start, previous.end, lesson.start, lesson.end) ??
      getTextChange(previous.location, lesson.location) ??
      getTextChange(previous.teacher, lesson.teacher) ??
      getTextChange(previous.title, lesson.title) ??
      getTextChange(previous.subject, lesson.subject) ??
      getTextChange(previous.description, lesson.description);

   return detailChange ? `${lesson.title} changed: ${detailChange}` : `${lesson.title} was changed`;
}

function getTextChange(previous: string, next: string) {
   return previous === next ? null : `${previous || "Not set"} → ${next || "Not set"}`;
}

function getTimeChange(previousStart: string, previousEnd: string, nextStart: string, nextEnd: string) {
   if (previousStart === nextStart && previousEnd === nextEnd) {
      return null;
   }

   const formatRange = (startValue: string, endValue: string) => {
      const start = parseLocalDateTime(startValue);
      const end = parseLocalDateTime(endValue);
      return `${dayLabel.format(start)} ${timeLabel.format(start)}–${timeLabel.format(end)}`;
   };

   return `${formatRange(previousStart, previousEnd)} → ${formatRange(nextStart, nextEnd)}`;
}
