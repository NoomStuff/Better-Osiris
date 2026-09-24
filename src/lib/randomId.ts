/** crypto.randomUUID only exists in secure contexts; plain-HTTP deployments need a uniqueness fallback. */
export function randomId() {
   return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
