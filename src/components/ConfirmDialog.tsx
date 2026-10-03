import { OverlayPanel } from "./OverlayPanel";
import { usePanelClose } from "../hooks/usePanelClose";
import { Button } from "./Button";
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
   // Every close path, including a hardware back, plays the same closing animation the other
   // panels use before the parent state clears.
   const { isClosing, close: closePanel } = usePanelClose(isOpen, onCancel);

   if (!isOpen && !isClosing) {
      return null;
   }

   return (
      <OverlayPanel
         className="confirm-dialog"
         backdropClassName="confirm-dialog__backdrop"
         surfaceClassName="confirm-dialog__panel"
         closeLabel={cancelLabel}
         labelledBy="confirm-dialog-title"
         dialogRole="alertdialog"
         isClosing={isClosing}
         onClose={closePanel}
      >
         <div className="confirm-dialog__content">
            <header className="confirm-dialog__header">
               <h2 id="confirm-dialog-title">{title}</h2>
               <p>{detail}</p>
            </header>

            <div className="confirm-dialog__actions">
               <Button disabled={isConfirming} onClick={closePanel}>
                  {cancelLabel}
               </Button>
               <Button variant={variant === "danger" ? "danger" : "primary"} disabled={isConfirming} onClick={onConfirm}>
                  {isConfirming ? "Working..." : confirmLabel}
               </Button>
            </div>
         </div>
      </OverlayPanel>
   );
}
