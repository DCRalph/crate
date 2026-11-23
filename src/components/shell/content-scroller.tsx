"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type UIEvent } from "react";

/** How a page's own scroller makes itself known to the glass it sits in. */
const ScrollerContext = createContext<{ attach: (element: HTMLDivElement | null) => void; onScroll: (event: UIEvent<HTMLDivElement>) => void } | null>(null);

/**
 * The glass's content area, and the page's main landmark. Each page scrolls
 * in its own scroller (`PageScroller`), exactly the size of the glass, so the
 * picture taken of it for a page transition is clipped to the glass and never
 * spills over the console. This keeps what the browser would otherwise do: a
 * new page starts at the top, and Back returns to where you were (so a long
 * album grid isn't lost by opening an album). A page is its path and its
 * query, so a folder opened in the covers layout or the next page of a table
 * starts at the top too.
 *
 * It also gives the page's scroller the keyboard's focus when the path
 * changes, unless something is being typed, so the arrow and Page keys
 * scroll the page that was just opened and not nothing at all.
 */
export function ContentScroller({ className, children }: { className?: string; children: React.ReactNode }) {
  const scroller = useRef<HTMLDivElement | null>(null);
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

  // A page's scroller is attached before this runs for the place it belongs to, so it is the one restored.
  useLayoutEffect(() => {
    const element = scroller.current;
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
    const element = scroller.current;
    // Only from the link or key that led here (or from nowhere): a search being typed keeps its box.
    const fromOutside = !active || active === document.body || (active.matches("a, button") && !element?.contains(active));
    if (fromOutside) element?.focus({ preventScroll: true });
  }, [pathname]);

  const attach = useCallback((element: HTMLDivElement | null) => {
    if (element) scroller.current = element;
  }, []);
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => positions.current.set(place, event.currentTarget.scrollTop), [place]);

  return (
    <ScrollerContext value={{ attach, onScroll }}>
      <main className={className}>{children}</main>
    </ScrollerContext>
  );
}

/** A page's own scroller, filling the glass. Rendered by `Page`; the page transition is a picture of this. */
export function PageScroller({ children }: { children: React.ReactNode }) {
  const scroller = useContext(ScrollerContext);
  return (
    <div
      ref={scroller?.attach}
      onScroll={scroller?.onScroll}
      tabIndex={-1}
      data-scroller
      className="absolute inset-0 overflow-x-hidden overflow-y-auto outline-none [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin]"
    >
      {children}
    </div>
  );
}
