import { ViewTransition, type ReactNode } from "react";

/**
 * A page's content, for the moment one page gives way to another: the old one
 * fades out as the new one rises in, in one movement, while the rail, the
 * glass's frame and the console hold still. The browser does the animating
 * (a view transition), so a browser without them simply swaps the pages. The
 * motion is in globals.css under `.page`. The child must be the page's own
 * scroller, so the picture taken of it is clipped to the glass.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * A cover that is the same picture on two pages: a tile in a grid, and the
 * top of the page the tile opens. Given the same `name` in both places it
 * travels from one to the other instead of blinking out and in. Without a
 * name it is only its children. A name can be on screen once at a time.
 */
export function SharedCover({ name, children }: { name: string | undefined; children: ReactNode }) {
  if (!name) return children;
  return (
    <ViewTransition name={name} share="cover" default="none">
      {children}
    </ViewTransition>
  );
}
