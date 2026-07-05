import { useEffect } from "react";

function setStableViewportHeight() {
   const height = window.visualViewport?.height ?? window.innerHeight;
   document.documentElement.style.setProperty("--stable-vh", `${height}px`);
   document.documentElement.style.setProperty("--stable-vh-double", `${height * 2}px`);
   document.documentElement.style.setProperty("--stable-vh-quad", `${height * 4}px`);
}

function setPageScrollability() {
   const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
   const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
   document.documentElement.dataset["pageScrollable"] = scrollHeight - viewportHeight > 1 ? "true" : "false";
}

export function useViewportMetrics() {
   useEffect(() => {
      let viewportWidth = window.innerWidth;
      setStableViewportHeight();

      const updateForStableViewportChange = () => {
         const nextWidth = window.innerWidth;
         if (Math.abs(nextWidth - viewportWidth) > 24) {
            viewportWidth = nextWidth;
            setStableViewportHeight();
         }
      };
      const updateAfterOrientationChange = () => {
         window.setTimeout(() => {
            viewportWidth = window.innerWidth;
            setStableViewportHeight();
         }, 250);
      };

      window.addEventListener("resize", updateForStableViewportChange);
      window.addEventListener("orientationchange", updateAfterOrientationChange);
      return () => {
         window.removeEventListener("resize", updateForStableViewportChange);
         window.removeEventListener("orientationchange", updateAfterOrientationChange);
      };
   }, []);

   useEffect(() => {
      let animationFrame = 0;
      const update = () => {
         window.cancelAnimationFrame(animationFrame);
         animationFrame = window.requestAnimationFrame(setPageScrollability);
      };

      update();
      const resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
      window.addEventListener("resize", update);
      window.visualViewport?.addEventListener("resize", update);
      window.addEventListener("orientationchange", update);

      return () => {
         window.cancelAnimationFrame(animationFrame);
         resizeObserver.disconnect();
         window.removeEventListener("resize", update);
         window.visualViewport?.removeEventListener("resize", update);
         window.removeEventListener("orientationchange", update);
      };
   }, []);
}
