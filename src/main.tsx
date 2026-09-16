import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PreferencesProvider } from "./hooks/PreferencesProvider";
import { notifyError } from "./lib/notyf";
import { attachOverlayScrollbar } from "./lib/overlayScrollbar";
import { applyTheme, getStoredTheme } from "./lib/theme";
import "@fontsource-variable/quicksand/index.css";
import "virtual:app-icons.css";
import "./styles/global.css";
import "./styles/themes/index.css";

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

applyTheme(getStoredTheme());
attachOverlayScrollbar(document.body);

ReactDOM.createRoot(rootElement).render(
   <React.StrictMode>
      <ErrorBoundary>
         <PreferencesProvider>
            <App />
         </PreferencesProvider>
      </ErrorBoundary>
   </React.StrictMode>
);
