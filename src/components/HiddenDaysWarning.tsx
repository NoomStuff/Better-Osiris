import { WarningBanner } from "./WarningBanner";

interface HiddenDaysWarningProps {
   /** Long weekday names, e.g. ["Saturday", "Sunday"]. */
   labels: string[];
   onShow: () => void;
}

function joinDayLabels(labels: string[]) {
   const last = labels.at(-1);
   if (labels.length <= 1 || last === undefined) {
      return labels.join(", ");
   }

   return `${labels.slice(0, -1).join(", ")} and ${last}`;
}

export function HiddenDaysWarning({ labels, onShow }: HiddenDaysWarningProps) {
   const dayList = joinDayLabels(labels);
   const dayWord = labels.length === 1 ? "that day is" : "those days are";

   return (
      <WarningBanner action={{ label: `Show ${dayList}`, onClick: onShow }}>
         Classes are also scheduled on <strong>{dayList}</strong>, but {dayWord} hidden.
      </WarningBanner>
   );
}
