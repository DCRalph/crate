"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The scrolling content column. The page scrolls inside this element rather
 * than the window, so the browser's own scroll handling doesn't apply and it
 * is done here: a new page starts at the top, and Back returns to where you
 * were (so a long album grid isn't lost by opening an album).
 */
export function ContentScroller({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  /** Where each page was left, by path. */
  const positions = useRef(new Map<string, number>());
  /** True between a Back or Forward press and the page it leads to. */
  const restoring = useRef(false);

  useEffect(() => {
    const onPop = () => (restoring.current = true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const saved = restoring.current ? (positions.current.get(pathname) ?? 0) : 0;
    restoring.current = false;
    element.scrollTop = saved;
    if (!saved) return;
    // Lists that load after the page mounts are shorter than the saved position at first,
    // so keep trying for a moment until the content is tall enough.
    let tries = 0;
    const timer = setInterval(() => {
      if (Math.abs(element.scrollTop - saved) < 2 || ++tries > 20) return clearInterval(timer);
      element.scrollTop = saved;
    }, 50);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <div ref={ref} className={className} onScroll={(event) => positions.current.set(pathname, event.currentTarget.scrollTop)}>
      {children}
    </div>
  );
}
