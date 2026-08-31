import { Component, type ErrorInfo, type ReactNode } from "react";
import { notifyError } from "../lib/notyf";
import { Button } from "./Button";

interface ErrorBoundaryProps {
   children: ReactNode;
   variant?: "fatal" | "view";
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

      if (this.props.variant === "view") {
         return (
            <div className="view-error-boundary" role="alert">
               <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
               <p>This view could not be rendered.</p>
               <small>{this.state.errorMessage}</small>
               <Button onClick={() => this.setState({ errorMessage: null })}>Try again</Button>
            </div>
         );
      }

      return (
         <main className="fatal-error-boundary" role="alert">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <h1>Better Osiris could not continue.</h1>
            <p>{this.state.errorMessage}</p>
            <Button onClick={() => window.location.reload()}>Reload app</Button>
         </main>
      );
   }
}
