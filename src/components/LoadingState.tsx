import "./LoadingState.css";

interface LoadingStateProps {
   message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
   return (
      <div className="loading-state">
         <span className="spinner" />
         <p>{message}</p>
      </div>
   );
}
