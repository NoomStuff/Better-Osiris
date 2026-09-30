import { useEffect, useState } from "react";

/** Calendar-level consumers use a minute tick; progress indicators subscribe independently. */
export function useClock(intervalMs: number, override: Date | null = null) {
   const [now, setNow] = useState(() => new Date());
   useEffect(() => {
      if (override) return;
      let timer: ReturnType<typeof setTimeout>;
      const update = () => {
         clearTimeout(timer);
         if (document.visibilityState !== "visible") return;
         setNow(new Date());
         timer = setTimeout(update, intervalMs - (Date.now() % intervalMs));
      };
      const onVisibilityChange = () => {
         if (document.visibilityState === "visible") update();
         else clearTimeout(timer);
      };
      update();
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
         clearTimeout(timer);
         document.removeEventListener("visibilitychange", onVisibilityChange);
      };
   }, [intervalMs, override]);
   return override ?? now;
}
