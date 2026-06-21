import { OverlayPanel } from "./OverlayPanel";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
   isOpen: boolean;
   title: string;
   detail: string;
   confirmLabel: string;
   cancelLabel?: string;
   variant?: "default" | "danger";
   isConfirming?: boolean;
   onCancel: () => void;
   onConfirm: () => void;
}

export function ConfirmDialog({
   isOpen,
   title,
   detail,
   confirmLabel,
   cancelLabel = "Cancel",
   variant = "default",
   isConfirming = false,
   onCancel,
   onConfirm,
}: ConfirmDialogProps) {
   if (!isOpen) {
      return null;
   }

   return (
      <OverlayPanel
         className="confirm-dialog"
         backdropClassName="confirm-dialog__backdrop"
         surfaceClassName="confirm-dialog__panel"
         closeLabel={cancelLabel}
         labelledBy="confirm-dialog-title"
         onClose={onCancel}
      >
         <div className="confirm-dialog__content">
            <header className="confirm-dialog__header">
               <h2 id="confirm-dialog-title">{title}</h2>
               <p>{detail}</p>
            </header>

            <div className="confirm-dialog__actions">
               <button className="confirm-dialog__button" type="button" disabled={isConfirming} onClick={onCancel}>
                  {cancelLabel}
               </button>
               <button
                  className="confirm-dialog__button confirm-dialog__button--confirm"
                  type="button"
                  data-variant={variant}
                  disabled={isConfirming}
                  onClick={onConfirm}
               >
                  {isConfirming ? "Working..." : confirmLabel}
               </button>
            </div>
         </div>
      </OverlayPanel>
   );
}
