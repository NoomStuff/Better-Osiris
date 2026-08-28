/** React ids contain characters that are invalid in CSS custom idents. */
export function getTooltipAnchorName(id: string) {
   return `--tt-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
}
