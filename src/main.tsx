import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { notifyError } from "./lib/notyf";
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

function redirectToLogin() {
   const nextPath = `${window.location.pathname}${window.location.search}`;
   const target = nextPath && nextPath !== "/" ? `/login.html?next=${encodeURIComponent(nextPath)}` : "/login.html";
   window.location.replace(target);
}

function hasAuthCookie() {
   if (import.meta.env.DEV) {
      return true;
   }

   return document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .some((cookie) => cookie.startsWith("auth="));
}

if (!hasAuthCookie()) {
   redirectToLogin();
} else {
   ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
         <App />
      </React.StrictMode>
   );
}
