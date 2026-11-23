import { Suspense } from "react";

import { nowPlayingLayer } from "~/components/player/now-playing-layer";
import { PlayerBar } from "~/components/player/player-bar";
import { ContentScroller } from "~/components/shell/content-scroller";
import { CrumbProvider } from "~/components/shell/crumb";
import { GroupTabs, Rail } from "~/components/shell/rail";
import { requireUser } from "~/server/auth/session";

/**
 * The signed-in shell, built as a cabinet: the rail of pages on the enamel,
 * the glass window every page is shown behind, and the console across the
 * bottom. Signed-out visitors are sent to /signin. The API does its own
 * checks; this only decides what to draw.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser("/home");

  return (
    <CrumbProvider>
      {/* Pinned to the viewport so each page's own scroller is the only thing that scrolls. */}
      <div className="enamel fixed inset-0 grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto]">
        <Rail user={{ name: user.name, username: user.username ?? user.email, isAdmin: user.role === "admin" }} />
        <div className="min-h-0 min-w-0 px-1.5 pt-0.5 pb-1.5 md:py-3 md:pr-3 md:pl-0">
          <div className="glass glass-window relative isolate flex h-full flex-col overflow-hidden">
            <Suspense>
              <GroupTabs />
            </Suspense>
            {/* Reads the URL's query, which a prerendered shell doesn't have yet. */}
            <Suspense>
              <ContentScroller className="relative min-h-0 flex-1">{children}</ContentScroller>
            </Suspense>
            {/* Where Now playing is drawn, over the page, when it is open. */}
            <div id={nowPlayingLayer} className="contents" />
            <div className="glass-bevel absolute inset-0 z-20" aria-hidden />
          </div>
        </div>
        <PlayerBar />
      </div>
    </CrumbProvider>
  );
}
