import { APP_SHORTCUT_LABELS } from "../lib/appShortcuts";
import type { GridZoom, ViewMode } from "../types/roster";
import { IconButton } from "./IconButton";
import { ToolbarActionButtons, ToolbarActionSelector, type ToolbarActionOption } from "./ToolbarActionGroup";
import "./AppToolbar.css";

interface AppToolbarProps {
   viewMode: ViewMode;
   gridZoom: GridZoom;
   isRefreshing?: boolean;
   onChangeView: (view: ViewMode) => void;
   onChangeGridZoom: (zoom: GridZoom) => void;
   onExpandAllAgenda: () => void;
   onCloseAllAgenda: () => void;
   onOpenSettings: () => void;
}

const zoomOptions: ToolbarActionOption<GridZoom>[] = [
   { id: "hour", label: "1h", tooltip: "Use 1 hour grid rows", shortcut: "Ctrl + 1", activationId: "zoom-hour" },
   { id: "half", label: "30m", tooltip: "Use 30 minute grid rows", shortcut: "Ctrl + 2", activationId: "zoom-half" },
   { id: "quarter", label: "15m", tooltip: "Use 15 minute grid rows", shortcut: "Ctrl + 3", activationId: "zoom-quarter" },
];

export function AppToolbar({
   viewMode,
   gridZoom,
   isRefreshing = false,
   onChangeView,
   onChangeGridZoom,
   onExpandAllAgenda,
   onCloseAllAgenda,
   onOpenSettings,
}: AppToolbarProps) {
   return (
      <header className="app-toolbar">
         <div className="app-toolbar__identity">
            <p className="eyebrow">MBORijnland</p>
            <h1>Better Osiris</h1>
         </div>

         {isRefreshing ? <span className="app-toolbar__spinner" aria-label="Refreshing roster data" role="status" /> : null}

         <div className="app-toolbar__actions">
            {viewMode === "grid" ? (
               <ToolbarActionSelector label="Timeline zoom" options={zoomOptions} value={gridZoom} onChange={onChangeGridZoom} key="view-grid" />
            ) : (
               <ToolbarActionButtons
                  label="Agenda sections"
                  actions={[
                     {
                        id: "expand",
                        label: "Expand",
                        tooltip: "Expand all agenda days",
                        shortcut: "Ctrl + Left / Ctrl + 1",
                        activationId: "agenda-expand",
                        onPress: onExpandAllAgenda,
                     },
                     {
                        id: "close",
                        label: "Close",
                        tooltip: "Close all agenda days",
                        shortcut: "Ctrl + Right / Ctrl + 2",
                        activationId: "agenda-close",
                        onPress: onCloseAllAgenda,
                     },
                  ]}
                  key="view-agenda"
               />
            )}

            <span className="app-toolbar__divider" aria-hidden="true" />

            <div className="view-toggle" role="tablist" aria-label="View mode">
               <IconButton
                  className="view-toggle__button"
                  icon="fa-solid fa-list"
                  label="Agenda view"
                  shortcut={APP_SHORTCUT_LABELS.agendaView}
                  tooltipPlacement="bottom"
                  activationId="agenda-view"
                  selected={viewMode === "agenda"}
                  onClick={() => onChangeView("agenda")}
                  role="tab"
                  aria-selected={viewMode === "agenda"}
               />
               <IconButton
                  className="view-toggle__button"
                  icon="fa-solid fa-table-cells-large"
                  label="Grid view"
                  shortcut={APP_SHORTCUT_LABELS.gridView}
                  tooltipPlacement="bottom"
                  activationId="grid-view"
                  selected={viewMode === "grid"}
                  onClick={() => onChangeView("grid")}
                  role="tab"
                  aria-selected={viewMode === "grid"}
               />
            </div>

            <span className="app-toolbar__divider" aria-hidden="true" />

            <IconButton
               className="app-toolbar__settings-button"
               icon="fa-solid fa-gear"
               label="Open settings"
               shortcut={APP_SHORTCUT_LABELS.settings}
               activationId="settings"
               tooltipAlign="end"
               tooltipPlacement="bottom"
               hoverEffect="rotate"
               onClick={onOpenSettings}
            />
         </div>
      </header>
   );
}
