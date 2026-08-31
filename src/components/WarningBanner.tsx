import type { ReactNode } from "react";
import { Button } from "./Button";
import "./WarningBanner.css";

interface WarningBannerProps {
   children: ReactNode;
   action?: { label: string; onClick: () => void };
   icon?: string;
}

const DEFAULT_ICON = "fa-solid fa-triangle-exclamation";

/** A page-backdrop warning strip: what went on and, optionally, the way out. */
export function WarningBanner({ children, action, icon = DEFAULT_ICON }: WarningBannerProps) {
   return (
      <aside className="warning-banner" role="status">
         <i className={icon} aria-hidden="true" />
         <p>{children}</p>
         {action ? (
            <Button variant="warning" onClick={action.onClick}>
               {action.label}
            </Button>
         ) : null}
      </aside>
   );
}
