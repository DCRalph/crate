"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

/**
 * The measured width of the table's own card, in px, or `null` before the first
 * measurement.
 *
 * Columns drop out by the width of the table rather than the width of the
 * window because those two disagree: the console sidebar takes 16rem off one
 * without touching the other, and a page can put a rail beside the table too.
 * A media query cannot see either.
 */
const TableWidthContext = createContext<number | null>(null);

export const TableWidthProvider = TableWidthContext.Provider;

/**
 * The table's width for a cell renderer that needs it — usually to fold a
 * column's value into another cell once that column has dropped out.
 * `null` means "not measured yet", which renders as if there were room.
 */
export function useTableWidth(): number | null {
  return useContext(TableWidthContext);
}

/** Whether a column that wants `showFrom` px has them. Unmeasured counts as yes. */
export function fitsWidth(showFrom: number | undefined, width: number | null) {
  return showFrom == null || width == null || width >= showFrom;
}

// Measuring has to happen before the browser paints, or a phone shows a
// desktop's worth of columns for a frame and jumps.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
