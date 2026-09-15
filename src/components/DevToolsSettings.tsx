import { getClassReminderBody, getReminderMinutes } from "../lib/classReminders";
import { getClassNotificationBodies, requestNotificationPermission } from "../lib/classNotifications";
import { closeNotifications, deliverNotification } from "../lib/notificationDelivery";
import { DEV_CLASS_STATUS_PREVIEW_MODES } from "../lib/devStatusPreview";
import { formatClock } from "../lib/date";
import { notifyError, notifySuccess, notifyWarning } from "../lib/notyf";
import type { SessionClassDiff } from "../lib/classDiffs";
import type { ClassSnapshot } from "../types/weeks";
import { usePreferences } from "../hooks/preferences";
import { ActionButtons, ActionSelector } from "./ActionGroup";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Slider } from "./Slider";
import { ToggleSwitch } from "./ToggleSwitch";

const DAY_MINUTES = 24 * 60;
const NOTIFICATION_TEST_GROUPS = [
   {
      label: "Notification tests",
      types: [
         ["added", "Added", "Send a class-added notification"],
         ["changed", "Changed", "Send a room-change notification"],
         ["cancelled", "Cancelled", "Send a cancellation notification"],
         ["starting", "Starting", "Send a class-starting notification"],
      ],
   },
   {
      label: "Grouped notification tests",
      types: [
         ["group-added", "Added group", "Send a summary of three added classes"],
         ["group-changed", "Changed group", "Send a summary of three changed classes"],
         ["group-cancelled", "Cancelled group", "Send a summary of three cancelled classes"],
      ],
   },
   {
      label: "Notification timing tests",
      types: [
         ["ongoing", "During class", "Send a time change for an ongoing class"],
         ["ended", "After class", "Send a room change for an ended class"],
         ["expires", "Expires in 5s", "Send a reminder and close it after five seconds"],
      ],
   },
   {
      label: "Repeated notification tests",
      types: [
         ["twice", "Changed twice", "Show two successive room-change alerts"],
         ["reverted", "Reverted", "Show a room-change alert followed by its reversal"],
      ],
   },
] as const;
type NotificationTest = (typeof NOTIFICATION_TEST_GROUPS)[number]["types"][number][0];

export function DevToolsSettings() {
   const { devPreview } = usePreferences();
   const { isEnabled, perceivedNow, statusPreviewMode, timeOverride } = devPreview;
   const isLive = timeOverride === null;
   const perceivedMinutes = perceivedNow.getHours() * 60 + perceivedNow.getMinutes();

   const changeDate = (value: string) => {
      const [yearText, monthText, dayText] = /^(\d+)-(\d+)-(\d+)$/.exec(value)?.slice(1) ?? [];
      if (yearText === undefined || monthText === undefined || dayText === undefined) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
      devPreview.changeTimeOverride(nextDate);
   };

   const stepDay = (days: number) => {
      const nextDate = new Date(perceivedNow);
      nextDate.setDate(nextDate.getDate() + days);
      devPreview.changeTimeOverride(nextDate);
   };

   const changeTime = (minutes: number) => {
      const nextDate = new Date(perceivedNow);
      nextDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      devPreview.changeTimeOverride(nextDate);
   };

   return (
      <section className="settings-section" aria-labelledby="devtools-settings-title">
         <div className="settings-section__header settings-section__header--with-control">
            <div className="settings-section__copy">
               <h3 id="devtools-settings-title">Devtools</h3>
               <p>Local-only test helpers. Fake the clock and class changes; these controls never ship.</p>
            </div>
            <ToggleSwitch checked={isEnabled} label="Enable devtools" onCheckedChange={devPreview.toggle} />
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
                  <Button size="compact" disabled={isLive} onClick={() => devPreview.changeTimeOverride(null)}>
                     Back to now
                  </Button>
               </div>

               <div className="devtools-group">
                  <span className="devtools-group__label">Class changes</span>
                  <ActionSelector
                     label="Class changes"
                     options={DEV_CLASS_STATUS_PREVIEW_MODES}
                     value={statusPreviewMode}
                     onChange={devPreview.setStatusPreviewMode}
                  />
               </div>

               <div className="devtools-group">
                  <span className="devtools-group__label">Notifications</span>
                  {NOTIFICATION_TEST_GROUPS.map((group) => (
                     <ActionButtons
                        key={group.label}
                        label={group.label}
                        actions={group.types.map(([id, label, tooltip]) => ({
                           id,
                           label,
                           tooltip,
                           onPress: () => void testPushNotification(id, perceivedNow),
                        }))}
                     />
                  ))}
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

async function testPushNotification(type: NotificationTest, perceivedNow: Date) {
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

   const status = type === "added" || type === "group-added" ? "added" : type === "cancelled" || type === "group-cancelled" ? "cancelled" : "changed";
   const sample = createSampleClassDiff(perceivedNow, status);
   const reminder = type === "starting" || type === "expires";
   if (type === "ongoing" || type === "ended") {
      const start = new Date(perceivedNow.getTime() - (type === "ongoing" ? 15 : 120) * 60_000).toISOString();
      const end = new Date(perceivedNow.getTime() + (type === "ongoing" ? 45 : -60) * 60_000).toISOString();
      sample.schoolClass = { ...sample.schoolClass, start, end };
      sample.previousClass = {
         ...sample.schoolClass,
         status: "scheduled",
         room: type === "ongoing" ? "B12" : "A101",
         end: new Date(new Date(end).getTime() - 15 * 60_000).toISOString(),
      };
   }
   const diffs = type.startsWith("group-")
      ? Array.from({ length: 3 }, (_, index) => ({ ...sample, schoolClass: { ...sample.schoolClass, id: `devtools-${index}` } }))
      : [sample];
   const bodies = reminder
      ? [
           getClassReminderBody(
              { ...sample.schoolClass, start: new Date(perceivedNow.getTime() + getReminderMinutes() * 60_000).toISOString() },
              perceivedNow.getTime()
           ),
        ]
      : getClassNotificationBodies(diffs);
   if (type === "twice" || type === "reverted") {
      bodies.push(
         ...getClassNotificationBodies([
            {
               ...sample,
               previousClass: { ...sample.schoolClass, status: "scheduled" },
               schoolClass: { ...sample.schoolClass, room: type === "twice" ? "C04" : "A101" },
            },
         ])
      );
   }
   try {
      for (const body of bodies) {
         const tag = `devtools-${type}:${crypto.randomUUID()}`;
         const expiresAt = type === "expires" ? Date.now() + 5_000 : undefined;
         if (await deliverNotification(body, tag, () => true, expiresAt)) {
            if (expiresAt !== undefined) setTimeout(() => void closeNotifications((notification) => notification.tag === tag), 5_000);
         }
      }
   } catch {
      notifyWarning("This browser could not show the notification.");
   }
}
