import { useEffect, useState } from "react";
import { useClassNotificationsPreference } from "../hooks/useClassNotificationsPreference";
import { CLASS_REMINDERS_KEY, REMINDER_MINUTES_KEY, getReminderMinutes } from "../lib/classReminders";
import { writeBrowserStorage } from "../lib/browserStorage";
import { ToggleSwitch } from "./ToggleSwitch";
import { NumberField } from "./NumberField";
export function ClassReminderSettings() {
   const preference = useClassNotificationsPreference(CLASS_REMINDERS_KEY);
   const [minutes, setMinutes] = useState(getReminderMinutes);
   useEffect(() => {
      const update = () => setMinutes(getReminderMinutes());
      window.addEventListener("storage", update);
      return () => window.removeEventListener("storage", update);
   }, []);
   return (
      <div className="notification-setting">
         <div className="notification-setting__copy">
            <span className="notification-setting__label">Class starts</span>
            <p id="class-starts-detail">A heads-up before class</p>
         </div>
         <div className="notification-setting__controls">
            <NumberField
               label="Minutes before class"
               value={minutes}
               unit="min"
               min={1}
               max={60}
               step={1}
               onChange={(value) => {
                  writeBrowserStorage("localStorage", REMINDER_MINUTES_KEY, String(value));
                  setMinutes(value);
               }}
            />
            <ToggleSwitch
               checked={preference.enabled}
               label="Notify me before class starts"
               aria-describedby="class-starts-detail"
               aria-busy={preference.isUpdating}
               disabled={!preference.isSupported || preference.isBlocked || preference.isUpdating}
               onCheckedChange={(enabled) => void preference.setEnabled(enabled)}
            />
         </div>
      </div>
   );
}
