import type { ClassStatus } from "../types/weeks";
import "./ClassStatusMarker.css";

const markers = {
   added: { icon: "fa-solid fa-thumbtack", label: "Added" },
   changed: { icon: "fa-solid fa-pen", label: "Changed" },
   cancelled: { icon: "fa-solid fa-trash-can", label: "Cancelled" },
} as const;

export function ClassStatusMarker({ status }: { status: ClassStatus }) {
   if (status === "scheduled") return null;
   const marker = markers[status];
   return (
      <span className="class-status-marker" data-status={status} role="img" aria-label={marker.label} title={marker.label}>
         <i className={marker.icon} aria-hidden="true" />
      </span>
   );
}
