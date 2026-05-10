import type { GridZoom, ViewMode } from "../types/roster";
import "./AppToolbar.css";

interface AppToolbarProps {
   viewMode: ViewMode;
   gridZoom: GridZoom;
   isRefreshing?: boolean;
   onChangeView: (view: ViewMode) => void;
   onChangeGridZoom: (zoom: GridZoom) => void;
   onExpandAllAgenda: () => void;
   onCloseAllAgenda: () => void;
}

const zoomOptions: { id: GridZoom; label: string }[] = [
   { id: "hour", label: "1h" },
   { id: "half", label: "30m" },
   { id: "quarter", label: "15m" },
];

export function AppToolbar({ viewMode, gridZoom, isRefreshing = false, onChangeView, onChangeGridZoom, onExpandAllAgenda, onCloseAllAgenda }: AppToolbarProps) {
   return (
      <header className="app-toolbar">
         <div className="app-toolbar__identity">
            <p className="eyebrow">MBORijnland</p>
            <h1>Better Osiris</h1>
         </div>

         {isRefreshing ? <span className="app-toolbar__spinner" aria-label="Refreshing roster data" role="status" /> : null}

         <div className="app-toolbar__actions">
            {viewMode === "grid" ? (
               <div className="zoom-toggle view-actions" data-zoom={gridZoom} role="group" aria-label="Timeline zoom" key="view-grid">
                  {zoomOptions.map((option) => (
                     <button className={option.id === gridZoom ? "is-selected" : ""} type="button" key={option.id} onClick={() => onChangeGridZoom(option.id)}>
                        {option.label}
                     </button>
                  ))}
               </div>
            ) : (
               <div className="agenda-toggle view-actions" role="group" aria-label="Agenda sections" key="view-agenda">
                  <button type="button" onClick={onExpandAllAgenda}>
                     Expand
                  </button>
                  <button type="button" onClick={onCloseAllAgenda}>
                     Close
                  </button>
               </div>
            )}

            <span className="app-toolbar__divider" aria-hidden="true" />

            <div className="view-toggle" role="tablist" aria-label="View mode">
               <button
                  className={`icon-button view-toggle__button ${viewMode === "agenda" ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => onChangeView("agenda")}
                  role="tab"
                  aria-selected={viewMode === "agenda"}
                  aria-label="Agenda view"
               >
                  <i className="fa-solid fa-list" />
               </button>
               <button
                  className={`icon-button view-toggle__button ${viewMode === "grid" ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => onChangeView("grid")}
                  role="tab"
                  aria-selected={viewMode === "grid"}
                  aria-label="Grid view"
               >
                  <i className="fa-solid fa-table-cells-large" />
               </button>
            </div>
         </div>
      </header>
   );
}
