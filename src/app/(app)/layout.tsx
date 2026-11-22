import { PlayerBar } from "~/components/player/player-bar";
import { AppHeader } from "~/components/shell/app-header";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { CrumbProvider } from "~/components/shell/crumb";
import { SidebarProvider } from "~/components/ui/sidebar";
import { requireUser } from "~/server/auth/session";

/**
 * The signed-in shell: sidebar, header, the page, and the player bar across
 * the bottom. Signed-out visitors are sent to /signin. The API does its own
 * checks; this only decides what to draw.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser("/albums");
  const isAdmin = user.role === "admin";

  return (
    <CrumbProvider>
      <SidebarProvider>
        {/* Pinned to the viewport so the content column is the only thing that scrolls. */}
        <div className="bg-sidebar fixed inset-0 flex flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1">
            <AppSidebar isAdmin={isAdmin} />
            <div className="bg-background flex w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto lg:mt-2 lg:rounded-tl-xl">
              <AppHeader user={{ name: user.name, username: user.username ?? user.email, isAdmin }} />
              {children}
            </div>
          </div>
          <PlayerBar />
        </div>
      </SidebarProvider>
    </CrumbProvider>
  );
}
