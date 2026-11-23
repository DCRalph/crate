"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The scrolling content column, and the page's main landmark. The page
 * scrolls inside this element rather than the window, so the browser's own
 * scroll handling doesn't apply and it is done here: a new page starts at the
 * top, and Back returns to where you were (so a long album grid isn't lost by
 * opening an album). A page is its path and its query, so a folder opened in
 * the covers layout or the next page of a table starts at the top too.
 *
 * It also takes the keyboard's focus when the path changes, unless something
 * is being typed, so the arrow and Page keys scroll the page that was just
 * opened and not nothing at all.
 */
export function ContentScroller({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const place = `${pathname}?${useSearchParams().toString()}`;
  /** Where each page was left. */
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
    const saved = restoring.current ? (positions.current.get(place) ?? 0) : 0;
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
  }, [place]);

  useEffect(() => {
    const active = document.activeElement;
    // Only from the link or key that led here (or from nowhere): a search being typed keeps its box.
    const fromOutside = !active || active === document.body || (active.matches("a, button") && !ref.current?.contains(active));
    if (fromOutside) ref.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <main ref={ref} tabIndex={-1} className={className} onScroll={(event) => positions.current.set(place, event.currentTarget.scrollTop)}>
      {children}
    </main>
  );
}
