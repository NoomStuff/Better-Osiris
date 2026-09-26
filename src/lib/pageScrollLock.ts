let lockCount = 0;
let restorePage: (() => void) | null = null;

function overrideStyles(style: CSSStyleDeclaration, properties: Record<string, string>, priority = "") {
   const previous = Object.keys(properties).map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
   }));
   for (const [property, value] of Object.entries(properties)) style.setProperty(property, value, priority);
   return () => {
      for (const entry of previous) {
         if (entry.value) style.setProperty(entry.property, entry.value, entry.priority);
         else style.removeProperty(entry.property);
      }
   };
}

export function lockPageScroll() {
   if (lockCount === 0) {
      const scrollY = window.scrollY;
      const restoreHtml = overrideStyles(
         document.documentElement.style,
         {
            overflow: "hidden",
            "overscroll-behavior": "none",
            // Keep the viewport width unchanged when a classic scrollbar disappears.
            "scrollbar-gutter": "stable",
         },
         "important"
      );
      const restoreBody = overrideStyles(document.body.style, {
         overflow: "hidden",
         "overscroll-behavior": "none",
         position: "fixed",
         top: `${-scrollY}px`,
         width: "100%",
      });
      restorePage = () => {
         restoreBody();
         restoreHtml();
         window.scrollTo(0, scrollY);
      };
   }
   lockCount += 1;

   // Nested dialogs share the first snapshot and restore it only after the last closes.
   let released = false;
   return () => {
      if (released) return;
      released = true;
      lockCount -= 1;
      if (lockCount === 0) {
         restorePage?.();
         restorePage = null;
      }
   };
}
