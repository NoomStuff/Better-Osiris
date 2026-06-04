import { Notyf } from "notyf";
import "notyf/notyf.min.css";

const notyf = new Notyf({
   position: {
      x: "right",
      y: "bottom",
   },
   duration: 5000,
   dismissible: true,
   ripple: true,
   types: [
      {
         type: "success",
         background: "#0da14a",
         duration: 2000,
         dismissible: false,
         icon: {
            className: "fa-solid fa-circle-check",
            tagName: "i",
            color: "white",
         },
      },
      {
         type: "warning",
         background: "#eb9321",
         icon: {
            className: "fa-solid fa-exclamation-triangle",
            tagName: "i",
            color: "white",
         },
      },
      {
         type: "error",
         background: "#c33e31",
         icon: {
            className: "fa-solid fa-xmark",
            tagName: "i",
            color: "white",
         },
      },
   ],
});

function getMessage(value: unknown, fallback: string) {
   if (value instanceof Error && value.message) {
      return value.message;
   }

   if (typeof value === "string" && value.trim()) {
      return value;
   }

   return fallback;
}

export function notifySuccess(message = "Success") {
   notyf.open({
      type: "success",
      message,
   });
}

export function notifyWarning(message: string, log = false, ...args: unknown[]) {
   if (log) console.warn(message, ...args);

   notyf.open({
      type: "warning",
      message,
   });
}

export function notifyError(error: unknown, fallback = "Application error", log = true, ...args: unknown[]) {
   if (log) console.error(error, ...args);

   const message = getMessage(error, fallback);
   notyf.open({
      type: "error",
      message,
   });
}
