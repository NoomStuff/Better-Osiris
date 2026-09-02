import { formatGridHour, type GridHourRange } from "../lib/gridHours";
import { WarningBanner } from "./WarningBanner";

export function HiddenGridHoursWarning({ count, targetRange, onShow }: { count: number; targetRange: GridHourRange; onShow: () => void }) {
   const classWord = count === 1 ? "class is" : "classes are";
   const rangeLabel = `${formatGridHour(targetRange[0])}–${formatGridHour(targetRange[1])}`;

   return (
      <WarningBanner action={{ label: `Show ${rangeLabel}`, onClick: onShow }}>
         <strong>{count}</strong> {classWord} outside the grid's shown hours.
      </WarningBanner>
   );
}
