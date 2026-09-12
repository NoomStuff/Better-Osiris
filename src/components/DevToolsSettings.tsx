import { getClassReminderBody, getReminderMinutes } from "../lib/classReminders";
import { deliverClassNotification, getClassNotificationBodies, requestNotificationPermission } from "../lib/classNotifications";
import type { DevClassStatusPreviewMode } from "../lib/devStatusPreview";
import { DEV_CLASS_STATUS_PREVIEW_MODES } from "../lib/devStatusPreview";
import { formatClock } from "../lib/date";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import type { SessionClassDiff } from "../lib/classDiffs";
import type { ClassSnapshot } from "../types/weeks";
import { ActionButtons, ActionSelector } from "./ActionGroup";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Slider } from "./Slider";
import { ToggleSwitch } from "./ToggleSwitch";

const DAY_MINUTES = 24 * 60;

interface DevToolsSettingsProps {
   isEnabled: boolean;
   perceivedNow: Date;
   timeOverride: Date | null;
   statusPreviewMode: DevClassStatusPreviewMode;
   onToggle: (enabled: boolean) => void;
   onChangeTimeOverride: (date: Date | null) => void;
   onChangeStatusPreviewMode: (mode: DevClassStatusPreviewMode) => void;
}

export function DevToolsSettings({
   isEnabled,
   perceivedNow,
   timeOverride,
   statusPreviewMode,
   onToggle,
   onChangeTimeOverride,
   onChangeStatusPreviewMode,
}: DevToolsSettingsProps) {
   const isLive = timeOverride === null;
   const perceivedMinutes = perceivedNow.getHours() * 60 + perceivedNow.getMinutes();

   const changeDate = (value: string) => {
      const [yearText, monthText, dayText] = /^(\d+)-(\d+)-(\d+)$/.exec(value)?.slice(1) ?? [];
      if (yearText === undefined || monthText === undefined || dayText === undefined) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
      onChangeTimeOverride(nextDate);
   };

   const stepDay = (days: number) => {
      const nextDate = new Date(perceivedNow);
      nextDate.setDate(nextDate.getDate() + days);
      onChangeTimeOverride(nextDate);
   };

   const changeTime = (minutes: number) => {
      const nextDate = new Date(perceivedNow);
      nextDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      onChangeTimeOverride(nextDate);
   };

   const testPushNotification = async (type: "added" | "changed" | "cancelled" | "starting") => {
      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
         notifyWarning(
            permission === "denied"
               ? "Notifications are blocked in your browser settings."
               : permission === "unsupported"
                 ? "This browser does not support notifications."
                 : "Notifications were not enabled."
         );
         return;
      }

      const sample = createSampleClassDiff(perceivedNow, type === "starting" ? "added" : type);
      const body =
         type === "starting"
            ? getClassReminderBody(
                 { ...sample.schoolClass, start: new Date(perceivedNow.getTime() + getReminderMinutes() * 60_000).toISOString() },
                 perceivedNow.getTime()
              )
            : getClassNotificationBodies([sample])[0];
      if (!body) return;
      try {
         await deliverClassNotification(body, `devtools-${type}`, () => true);
      } catch {
         notifyWarning("This browser could not show the notification.");
      }
   };

   return (
      <section className="settings-section" aria-labelledby="devtools-settings-title">
         <div className="settings-section__header settings-section__header--with-control">
            <div className="settings-section__copy">
               <h3 id="devtools-settings-title">Devtools</h3>
               <p>Local-only test helpers. Fake the clock and class changes; these controls never ship.</p>
            </div>
            <ToggleSwitch checked={isEnabled} label="Enable devtools" onCheckedChange={onToggle} />
         </div>

         {isEnabled ? (
            <div className="devtools-panel">
               <div className="devtools-date">
                  <IconButton icon="fa-solid fa-chevron-left" label="Previous day" hoverEffect="nudge-left" onClick={() => stepDay(-1)} />
                  <input
                     className="devtools-date__input"
                     type="date"
                     aria-label="Fake date"
                     value={formatDateInputValue(perceivedNow)}
                     onChange={(event) => changeDate(event.target.value)}
                  />
                  <IconButton icon="fa-solid fa-chevron-right" label="Next day" hoverEffect="nudge-right" onClick={() => stepDay(1)} />
               </div>

               <div className="devtools-clock">
                  <Slider
                     label="Fake clock"
                     min={0}
                     max={DAY_MINUTES - 1}
                     step={1}
                     value={Math.min(perceivedMinutes, DAY_MINUTES - 1)}
                     formatValue={formatClock}
                     onChange={changeTime}
                  />
                  <div className="devtools-ticks" aria-hidden="true">
                     <span>00:00</span>
                     <span>06:00</span>
                     <span>12:00</span>
                     <span>18:00</span>
                     <span>24:00</span>
                  </div>
               </div>

               <div className="devtools-footer">
                  <Button size="compact" disabled={isLive} onClick={() => onChangeTimeOverride(null)}>
                     Back to now
                  </Button>
               </div>

               <div className="devtools-group">
                  <span className="devtools-group__label">Class changes</span>
                  <ActionSelector
                     label="Class changes"
                     options={DEV_CLASS_STATUS_PREVIEW_MODES}
                     value={statusPreviewMode}
                     onChange={onChangeStatusPreviewMode}
                  />
               </div>

               <div className="devtools-group">
                  <span className="devtools-group__label">Notifications</span>
                  <ActionButtons
                     label="Notification tests"
                     actions={[
                        { id: "added", label: "Added", tooltip: "Send a class-added notification", onPress: () => void testPushNotification("added") },
                        { id: "changed", label: "Changed", tooltip: "Send a class-changed notification", onPress: () => void testPushNotification("changed") },
                        {
                           id: "cancelled",
                           label: "Cancelled",
                           tooltip: "Send a class-cancelled notification",
                           onPress: () => void testPushNotification("cancelled"),
                        },
                        {
                           id: "starting",
                           label: "Starting",
                           tooltip: "Send a class-starting notification",
                           onPress: () => void testPushNotification("starting"),
                        },
                     ]}
                  />
               </div>
               <div className="devtools-group">
                  <span className="devtools-group__label">Toasts</span>
                  <ActionButtons
                     label="Toast tests"
                     actions={[
                        { id: "success", label: "Success", tooltip: "Show a success toast", onPress: () => notifySuccess("Test success toast") },
                        { id: "warning", label: "Warning", tooltip: "Show a warning toast", onPress: () => notifyWarning("Test warning toast") },
                        {
                           id: "error",
                           label: "Error",
                           tooltip: "Show an error toast",
                           onPress: () => notifyError("Test error toast", "Test error toast", false),
                        },
                     ]}
                  />
               </div>
            </div>
         ) : null}
      </section>
   );
}

function createSampleClassDiff(perceivedNow: Date, status: "added" | "changed" | "cancelled"): SessionClassDiff {
   const dayKey = formatDateInputValue(perceivedNow);
   const schoolClass: ClassSnapshot = {
      id: "devtools-sample",
      title: "Testles",
      subject: "Devtools",
      start: `${dayKey}T09:00`,
      end: `${dayKey}T10:30`,
      teacher: "D. Boot",
      room: "B12",
      location: "Main building",
      description: "",
      status: "scheduled",
   };
   const previousClass: ClassSnapshot = { ...schoolClass, room: "A101", status: "scheduled" };

   if (status === "changed") return { schoolClass: { ...schoolClass, status, previous: previousClass }, previousClass, status };
   return { schoolClass: { ...schoolClass, status }, status };
}

function formatDateInputValue(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");

   return `${year}-${month}-${day}`;
}
