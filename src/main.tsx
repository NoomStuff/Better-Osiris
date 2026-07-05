import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { notifyError } from "./lib/notyf";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "@fontsource-variable/quicksand/index.css";
import "./styles/global.css";

window.addEventListener("error", (event) => {
   notifyError(event.error ?? event.message, "Unexpected app error.");
});

window.addEventListener("unhandledrejection", (event) => {
   notifyError(event.reason, "Unexpected async error.");
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
