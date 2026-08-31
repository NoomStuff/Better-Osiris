import type { DevClassStatusPreviewMode } from "../lib/devStatusPreview";
import { DEV_CLASS_STATUS_PREVIEW_MODES } from "../lib/devStatusPreview";
import { Button } from "./Button";

const DAY_MINUTES = 24 * 60;
const TIME_SLIDER_STEP_MINUTES = 15;

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
   const perceivedMinutes = perceivedNow.getHours() * 60 + perceivedNow.getMinutes();

   const handleDateOverrideChange = (value: string) => {
      const [yearText, monthText, dayText] = value.split("-");
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);

      if ([year, month, day].some((valuePart) => Number.isNaN(valuePart))) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setFullYear(year, month - 1, day);
      onChangeTimeOverride(nextDate);
   };

   const handleTimeOverrideChange = (value: string) => {
      const nextMinutes = Number(value);

      if (Number.isNaN(nextMinutes)) {
         return;
      }

      const nextDate = new Date(perceivedNow);
      nextDate.setHours(Math.floor(nextMinutes / 60), nextMinutes % 60, 0, 0);
      onChangeTimeOverride(nextDate);
   };

   return (
      <section className="settings-section" aria-labelledby="devtools-settings-title">
         <div className="settings-section__header">
            <div className="settings-section__copy">
               <h3 id="devtools-settings-title">Devtools</h3>
               <p>Local-only roster testing tools. These controls are not available in production.</p>
            </div>
         </div>

         <label className="settings-toggle">
            <input type="checkbox" checked={isEnabled} onChange={(event) => onToggle(event.target.checked)} />
            <span>
               <strong>Enable devtools</strong>
               <small>
                  {timeOverride
                     ? `Override: ${formatDateLabel(timeOverride)} ${formatTimeLabel(timeOverride)}`
                     : `Real time: ${formatDateLabel(perceivedNow)} ${formatTimeLabel(perceivedNow)}`}
               </small>
            </span>
         </label>

         {isEnabled ? (
            <div className="devtools-panel">
               <label className="settings-dialog__field settings-dialog__field--compact">
                  <span>Perceived date</span>
                  <input type="date" value={formatDateInputValue(perceivedNow)} onChange={(event) => handleDateOverrideChange(event.target.value)} />
               </label>

               <div className="time-slider">
                  <div className="time-slider__header">
                     <span>Perceived time</span>
                     <strong>{formatTimeLabel(perceivedNow)}</strong>
                  </div>
                  <input
                     type="range"
                     min={0}
                     max={DAY_MINUTES - TIME_SLIDER_STEP_MINUTES}
                     step={TIME_SLIDER_STEP_MINUTES}
                     value={Math.round(perceivedMinutes / TIME_SLIDER_STEP_MINUTES) * TIME_SLIDER_STEP_MINUTES}
                     onChange={(event) => handleTimeOverrideChange(event.target.value)}
                  />
                  <div className="time-slider__ticks" aria-hidden="true">
                     <span>00:00</span>
                     <span>06:00</span>
                     <span>12:00</span>
                     <span>18:00</span>
                     <span>23:45</span>
                  </div>
               </div>

               <div className="settings-dialog__actions">
                  <Button onClick={() => onChangeTimeOverride(new Date())}>Use current time</Button>
                  <Button disabled={!timeOverride} onClick={() => onChangeTimeOverride(null)}>
                     Clear override
                  </Button>
               </div>

               <div className="devtools-option">
                  <span className="devtools-option__label">Class diff preview</span>
                  <div className="settings-segmented-control" role="group" aria-label="Class diff preview">
                     {DEV_CLASS_STATUS_PREVIEW_MODES.map((mode) => (
                        <button
                           type="button"
                           key={mode.id}
                           aria-pressed={statusPreviewMode === mode.id}
                           data-active={statusPreviewMode === mode.id}
                           onClick={() => onChangeStatusPreviewMode(mode.id)}
                        >
                           {mode.label}
                        </button>
                     ))}
                  </div>
               </div>
            </div>
         ) : null}
      </section>
   );
}

function formatTimeLabel(date: Date) {
   const hours = String(date.getHours()).padStart(2, "0");
   const minutes = String(date.getMinutes()).padStart(2, "0");

   return `${hours}:${minutes}`;
}

function formatDateInputValue(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");

   return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
   const day = String(date.getDate()).padStart(2, "0");
   const month = String(date.getMonth() + 1).padStart(2, "0");

   return `${day}-${month}`;
}
