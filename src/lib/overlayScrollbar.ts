const IDLE_MS = 800;
const MIN_THUMB_HEIGHT = 32;

interface ScrollMetrics {
   scrollTop: number;
   viewport: number;
   scrollHeight: number;
}

/* Overlay scrollbars: the native bar is hidden and a slim thumb is drawn over the content,
   appearing while scrolling (or while grabbed) and fading out when idle. Nothing is
   reserved for the bar. The thumb is a child of the scroll container: a viewport-sized
   strip translated along with the scroll position, so the geometry stays trivial even for
   the page itself. */
export function attachOverlayScrollbar(host: HTMLElement): () => void {
   const isPageHost = host === document.body || host === document.documentElement;
   host.classList.add("overlay-scrollbar-host");
   if (isPageHost) {
      // Chromium draws the viewport scrollbar from the root element's styles, not the body's.
      document.documentElement.classList.add("overlay-scrollbar-host");
   }

   const track = document.createElement("div");
   track.className = isPageHost ? "overlay-scrollbar overlay-scrollbar--page" : "overlay-scrollbar";
   track.dataset["active"] = "false";
   track.dataset["scrollable"] = "false";
   const thumb = document.createElement("div");
   thumb.className = "overlay-scrollbar__thumb";
   track.append(thumb);
   host.append(track);

   let idleTimeoutId = 0;
   let dragStart: { pointerY: number; scrollTop: number; scrollRange: number; travel: number } | null = null;

   const metrics = (): ScrollMetrics => {
      if (!isPageHost) {
         return { scrollTop: host.scrollTop, viewport: host.clientHeight, scrollHeight: host.scrollHeight };
      }
      // The page may scroll on the viewport (desktop) or on the body (the mobile layout
      // promotes body to a scroll container), so read whichever one actually moved.
      return {
         scrollTop: window.scrollY || Math.max(document.documentElement.scrollTop, document.body.scrollTop),
         viewport: window.innerHeight,
         scrollHeight: document.documentElement.scrollHeight,
      };
   };

   const update = () => {
      const { scrollTop, viewport, scrollHeight } = metrics();
      const scrollable = scrollHeight > viewport + 1;
      track.dataset["scrollable"] = String(scrollable);
      if (!scrollable) {
         return;
      }

      const thumbHeight = Math.max((viewport / scrollHeight) * viewport, MIN_THUMB_HEIGHT);
      track.style.height = `${viewport}px`;
      track.style.transform = `translateY(${scrollTop}px)`;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.top = `${(scrollTop / (scrollHeight - viewport)) * (viewport - thumbHeight)}px`;
   };

   const hide = () => {
      track.dataset["active"] = "false";
   };

   const reveal = () => {
      track.dataset["active"] = "true";
      window.clearTimeout(idleTimeoutId);
      idleTimeoutId = window.setTimeout(hide, IDLE_MS);
   };

   const hold = () => window.clearTimeout(idleTimeoutId);

   const onScroll = (event: Event) => {
      // The page listener runs in capture on the document, so it also sees scrolls from
      // inner containers; only the page hosts themselves may drive the page thumb.
      if (isPageHost) {
         const target = event.target;
         if (target !== document && target !== document.documentElement && target !== host) {
            return;
         }
      }
      update();
      reveal();
   };

   const onThumbDragStart = (event: PointerEvent) => {
      event.preventDefault();
      const { scrollTop, viewport, scrollHeight } = metrics();
      const thumbHeight = Math.max((viewport / scrollHeight) * viewport, MIN_THUMB_HEIGHT);
      dragStart = {
         pointerY: event.clientY,
         scrollTop,
         scrollRange: Math.max(scrollHeight - viewport, 1),
         travel: Math.max(viewport - thumbHeight, 1),
      };
      thumb.setPointerCapture(event.pointerId);
      track.dataset["dragging"] = "true";
      hold();
   };

   const onThumbDragMove = (event: PointerEvent) => {
      if (!dragStart) {
         return;
      }
      const nextTop = dragStart.scrollTop + ((event.clientY - dragStart.pointerY) / dragStart.travel) * dragStart.scrollRange;
      // Assign both: exactly one of them is the real page scroller, the other is a no-op.
      if (isPageHost) {
         document.documentElement.scrollTop = nextTop;
         document.body.scrollTop = nextTop;
      } else {
         host.scrollTop = nextTop;
      }
   };

   const onThumbDragEnd = () => {
      if (!dragStart) {
         return;
      }
      dragStart = null;
      delete track.dataset["dragging"];
      reveal();
   };

   const onThumbEnter = () => hold();
   const onThumbLeave = () => {
      if (!dragStart) {
         reveal();
      }
   };

   if (isPageHost) {
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
   } else {
      host.addEventListener("scroll", onScroll, { passive: true });
   }
   thumb.addEventListener("pointerdown", onThumbDragStart);
   thumb.addEventListener("pointermove", onThumbDragMove);
   thumb.addEventListener("pointerup", onThumbDragEnd);
   thumb.addEventListener("pointercancel", onThumbDragEnd);
   thumb.addEventListener("pointerenter", onThumbEnter);
   thumb.addEventListener("pointerleave", onThumbLeave);

   const observer = new ResizeObserver(update);
   observer.observe(host);
   if (isPageHost) {
      window.addEventListener("resize", update);
   }
   update();

   return () => {
      window.clearTimeout(idleTimeoutId);
      observer.disconnect();
      if (isPageHost) {
         document.removeEventListener("scroll", onScroll, { capture: true });
         window.removeEventListener("resize", update);
      } else {
         host.removeEventListener("scroll", onScroll);
      }
      track.remove();
      host.classList.remove("overlay-scrollbar-host");
      if (isPageHost) {
         document.documentElement.classList.remove("overlay-scrollbar-host");
      }
   };
}
