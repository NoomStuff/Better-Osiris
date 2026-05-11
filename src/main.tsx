import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { logError } from "./lib/notify";
import "./styles/global.css";

window.addEventListener("error", (event) => {
   logError(event.error ?? event.message, "Unexpected app error.");
});

window.addEventListener("unhandledrejection", (event) => {
   logError(event.reason, "Unexpected async error.");
});

const rootElement = document.getElementById("app");

if (!rootElement) {
   throw new Error("Root element #app not found.");
}

ReactDOM.createRoot(rootElement).render(
   <React.StrictMode>
      <App />
   </React.StrictMode>
);
