import { Notyf } from "notyf";
import "notyf/notyf.min.css";

const notyf = new Notyf({
   duration: 5000,
   position: {
      x: "right",
      y: "bottom",
   },
   dismissible: true,
   ripple: false,
});

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
   if (error instanceof Error && error.message) {
      return error.message;
   }

   if (typeof error === "string" && error.trim()) {
      return error;
   }

   return fallback;
}

export function notifyError(error: unknown, fallback?: string) {
   notyf.error(getErrorMessage(error, fallback));
}

export function logError(error: unknown, fallback?: string) {
   console.error(error);
   notifyError(error, fallback);
}
