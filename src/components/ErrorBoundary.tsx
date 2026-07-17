import { Component, type ErrorInfo, type ReactNode } from "react";
import { notifyError } from "../lib/notyf";

interface ErrorBoundaryProps {
   children: ReactNode;
}

interface ErrorBoundaryState {
   errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
   override state: ErrorBoundaryState = { errorMessage: null };

   static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
      return { errorMessage: error instanceof Error ? error.message : "Unknown rendering error." };
   }

   override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
      notifyError(error, "The interface could not be rendered.", true, errorInfo.componentStack);
   }

   override render() {
      if (!this.state.errorMessage) {
         return this.props.children;
      }

      return (
         <main className="fatal-error-boundary" role="alert">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <h1>Better Osiris could not continue.</h1>
            <p>{this.state.errorMessage}</p>
            <button type="button" onClick={() => window.location.reload()}>
               Reload app
            </button>
         </main>
      );
   }
}
