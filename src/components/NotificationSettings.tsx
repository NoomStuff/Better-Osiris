import { useClassNotificationsPreference } from "../hooks/useClassNotificationsPreference";
import { ClassReminderSettings } from "./ClassReminderSettings";
import { ToggleSwitch } from "./ToggleSwitch";

/** The notifications section owns its own preference state, like every other settings section. */
export function NotificationSettings() {
   const notifications = useClassNotificationsPreference();
   const notificationDetail = !notifications.isSupported
      ? "Notifications are unavailable here. On iPhone or iPad, add this app to your Home Screen and open it there."
      : notifications.isBlocked
        ? "Notifications are blocked in your browser settings."
        : "Keep the app open for class alerts. Background tabs and sleeping devices may delay or miss them.";

   return (
      <section className="settings-section" aria-labelledby="notification-settings-title">
         <div className="settings-section__header">
            <div className="settings-section__copy">
               <h3 id="notification-settings-title">Notifications</h3>
               <p id="notification-settings-detail">{notificationDetail}</p>
            </div>
         </div>
         <div className="notification-settings__rows">
            <div className="notification-setting">
               <div className="notification-setting__copy">
                  <span className="notification-setting__label">Class changes</span>
                  <p id="class-changes-detail">Updates and cancellations</p>
               </div>
               <ToggleSwitch
                  checked={notifications.enabled}
                  label="Notify me about class changes"
                  aria-describedby="notification-settings-detail class-changes-detail"
                  aria-busy={notifications.isUpdating}
                  disabled={!notifications.isSupported || notifications.isBlocked || notifications.isUpdating}
                  onCheckedChange={(enabled) => void notifications.setEnabled(enabled)}
               />
            </div>
            <ClassReminderSettings />
         </div>
      </section>
   );
}
