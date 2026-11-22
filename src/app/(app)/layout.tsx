import { PlayerBar } from "~/components/player/player-bar";
import { ContentScroller } from "~/components/shell/content-scroller";
import { CrumbProvider } from "~/components/shell/crumb";
import { TopBar } from "~/components/shell/top-bar";
import { requireUser } from "~/server/auth/session";

/**
 * The signed-in shell: the tab bar, the page, and the player deck across the
 * bottom. Signed-out visitors are sent to /signin. The API does its own
 * checks; this only decides what to draw.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser("/albums");

  return (
    <CrumbProvider>
      {/* Pinned to the viewport so the content column is the only thing that scrolls. */}
      <div className="bg-background fixed inset-0 flex flex-col overflow-hidden">
        <TopBar user={{ name: user.name, username: user.username ?? user.email, isAdmin: user.role === "admin" }} />
        <ContentScroller className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</ContentScroller>
        <PlayerBar />
      </div>
    </CrumbProvider>
  );
}
