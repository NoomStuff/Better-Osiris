import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getBrowserDocument, getBrowserWindow } from "./lib/browser";
import { logError } from "./lib/notify";
import "./styles/global.css";

const appWindow = getBrowserWindow();
const appDocument = getBrowserDocument();

appWindow?.addEventListener("error", (event) => {
   const message = event.message || String(event.error ?? "");
   if (message.includes("__firefox__")) {
      console.warn("Ignored browser-injected script error:", message);
      return;
   }

   logError(event.error ?? event.message, "Unexpected app error.");
});

appWindow?.addEventListener("unhandledrejection", (event) => {
   logError(event.reason, "Unexpected async error.");
});

const rootElement = appDocument?.getElementById("app");

if (!rootElement) {
   throw new Error("Root element #app not found.");
}

ReactDOM.createRoot(rootElement).render(
   <React.StrictMode>
      <App />
   </React.StrictMode>
);
