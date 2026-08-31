import "./HiddenDaysWarning.css";

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
      <aside className="hidden-days-warning" role="status">
         <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
         <p>
            Classes are also scheduled on <strong>{dayList}</strong>, but {dayWord} hidden.
         </p>
         <button type="button" onClick={onShow}>
            Show {dayList}
         </button>
      </aside>
   );
}
