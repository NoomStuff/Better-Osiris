import { Notyf } from "notyf";
import "notyf/notyf.min.css";
import { escapeHtml } from "./html";

// Created lazily so importing this module never touches the DOM; toasts are skipped in DOM-less environments.
let notyfInstance: Notyf | null = null;

function getNotyf() {
   if (typeof document === "undefined") {
      return null;
   }

   notyfInstance ??= new Notyf({
      position: {
         x: "right",
         y: "bottom",
      },
      duration: 5000,
      dismissible: true,
      ripple: true,
      // Toast backgrounds are deliberately deeper than the UI tokens: white icons need contrast on them.
      types: [
         {
            type: "success",
            background: "hsl(144.73 85.057% 34.118%)",
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
            background: "hsl(33.861 83.471% 52.549%)",
            icon: {
               className: "fa-solid fa-exclamation-triangle",
               tagName: "i",
               color: "white",
            },
         },
         {
            type: "error",
            background: "hsl(5.342 59.836% 47.843%)",
            icon: {
               className: "fa-solid fa-xmark",
               tagName: "i",
               color: "white",
            },
         },
      ],
   });

   return notyfInstance;
}

function openToast(toast: { type: string; message: string }) {
   getNotyf()?.open(toast);
}

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
   openToast({
      type: "success",
      message: escapeHtml(message),
   });
}

export function notifyWarning(message: string) {
   openToast({
      type: "warning",
      message: escapeHtml(message),
   });
}

export function notifyError(error: unknown, fallback = "Application error", log = true, ...args: unknown[]) {
   if (log) console.error(error, ...args);

   const message = getMessage(error, fallback);
   openToast({
      type: "error",
      message: escapeHtml(message),
   });
}
