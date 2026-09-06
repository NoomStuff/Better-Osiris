import type { ClassStatus } from "../types/weeks";
import { CLASS_STATUS_ICONS } from "../lib/classFormat";
import "./ClassStatusMarker.css";

const labels = {
   added: "Added",
   changed: "Changed",
   cancelled: "Cancelled",
} as const;

export function ClassStatusMarker({ status }: { status: ClassStatus }) {
   if (status === "scheduled") return null;
   return (
      <span className="class-status-marker" data-status={status} role="img" aria-label={labels[status]} title={labels[status]}>
         <i className={CLASS_STATUS_ICONS[status]} aria-hidden="true" />
      </span>
   );
}
