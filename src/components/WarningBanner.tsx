import type { ReactNode } from "react";
import { monthDayLabel, timeLabel } from "../lib/date";
import { formatGridHour, type GridHourRange } from "../lib/gridHours";
import { Button } from "./Button";
import "./WarningBanner.css";

interface WarningBannerProps {
   children: ReactNode;
   action?: { label: string; onClick: () => void } | undefined;
   icon?: string;
}

export function WarningBanner({ children, action, icon = "fa-solid fa-triangle-exclamation" }: WarningBannerProps) {
   return (
      <aside className="warning-banner" role="status">
         <i className={icon} aria-hidden="true" />
         <p>{children}</p>
         {action ? (
            <Button variant="warning" onClick={action.onClick}>
               {action.label}
            </Button>
         ) : null}
      </aside>
   );
}

interface SyncWarningProps {
   fetchedAt: number;
   isOnline: boolean;
   /** Null when the roster itself loaded and only a supporting request failed. */
   errorDetail: string | null;
   isAuthError: boolean;
   onReplaceToken: () => void;
   onRetry: () => void;
}

/** Cached data stays visible whenever syncing fails; this says how old it is and what went wrong. */
export function SyncWarning({ fetchedAt, isOnline, errorDetail, isAuthError, onReplaceToken, onRetry }: SyncWarningProps) {
   const action = !isOnline ? undefined : isAuthError ? { label: "Replace token", onClick: onReplaceToken } : { label: "Try again", onClick: onRetry };
   const age = fetchedAt ? ` from ${monthDayLabel.format(new Date(fetchedAt))} at ${timeLabel.format(new Date(fetchedAt))}` : "";
   const reason = !isOnline ? "You're offline." : errorDetail !== null ? `Fetching your latest roster went wrong: ${errorDetail}` : "Can't check for updates.";

   return (
      <WarningBanner icon="fa-solid fa-cloud-arrow-down" action={action}>
         Showing your saved timetable{age}. {reason}
      </WarningBanner>
   );
}

function joinDayLabels(labels: readonly string[]) {
   const last = labels.at(-1);
   return labels.length <= 1 || last === undefined ? labels.join(", ") : `${labels.slice(0, -1).join(", ")} and ${last}`;
}

/** `labels` are long weekday names, e.g. ["Saturday", "Sunday"]. */
export function HiddenDaysWarning({ labels, onShow }: { labels: readonly string[]; onShow: () => void }) {
   const dayList = joinDayLabels(labels);
   const dayWord = labels.length === 1 ? "that day is" : "those days are";

   return (
      <WarningBanner action={{ label: `Show ${dayList}`, onClick: onShow }}>
         Classes are also scheduled on <strong>{dayList}</strong>, but {dayWord} hidden.
      </WarningBanner>
   );
}

export function HiddenGridHoursWarning({ count, targetRange, onShow }: { count: number; targetRange: GridHourRange; onShow: () => void }) {
   const classWord = count === 1 ? "class is" : "classes are";
   const rangeLabel = `${formatGridHour(targetRange[0])}–${formatGridHour(targetRange[1])}`;

   return (
      <WarningBanner action={{ label: `Show ${rangeLabel}`, onClick: onShow }}>
         <strong>{count}</strong> {classWord} outside the grid's shown hours.
      </WarningBanner>
   );
}
