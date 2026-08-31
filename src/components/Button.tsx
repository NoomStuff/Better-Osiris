import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

type ButtonVariant = "default" | "primary" | "danger" | "warning";
type ButtonSize = "regular" | "compact";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
   variant?: ButtonVariant;
   size?: ButtonSize;
   children: ReactNode;
}

/** Text-action sibling of IconButton. The surface lifts on hover while the button element stays
    put, so the hit area never moves away from the cursor mid-hover. */
export function Button({ variant = "default", size = "regular", className, type = "button", children, ...buttonProps }: ButtonProps) {
   const classes = ["button", `button--${variant}`, `button--${size === "compact" ? "compact" : "regular"}`, className ?? ""].filter(Boolean).join(" ");

   return (
      <span className={classes}>
         <button {...buttonProps} className="button__control" type={type}>
            <span className="button__surface">{children}</span>
         </button>
      </span>
   );
}
