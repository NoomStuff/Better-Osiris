import type { ButtonHTMLAttributes } from "react";
import "./ToggleSwitch.css";

interface ToggleSwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
   checked: boolean;
   label: string;
   onCheckedChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, label, onCheckedChange, className, disabled, type = "button", ...buttonProps }: ToggleSwitchProps) {
   const classes = ["toggle-switch", className ?? ""].filter(Boolean).join(" ");

   return (
      <button
         {...buttonProps}
         className={classes}
         type={type}
         role="switch"
         aria-label={label}
         aria-checked={checked}
         data-checked={checked}
         disabled={disabled}
         onClick={() => onCheckedChange(!checked)}
      >
         <span className="toggle-switch__track" aria-hidden="true">
            <span className="toggle-switch__thumb">
               <span className="toggle-switch__mark" />
            </span>
         </span>
      </button>
   );
}
