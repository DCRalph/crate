"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { site } from "~/lib/site";
import { cn } from "~/lib/utils";
import { navigation, navItemFor } from "./navigation";

/** The brand tile: a record on brand red. Drawn inline so it needs no request. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={site.name} className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="15.36" fill="var(--brand)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="32" cy="32" r="5" fill="#fff" />
    </svg>
  );
}

/** The sidebar: brand, the library, and the Admin group for admins. Collapses to icons on desktop, a sheet on phones. */
export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const current = navItemFor(pathname);
  const { setOpenMobile } = useSidebar();
  // On phones the sidebar is a sheet, so a tapped link has to dismiss it.
  const closeOnMobile = () => setOpenMobile(false);

  return (
    // Stops above the player bar, which spans the full width.
    <Sidebar collapsible="icon" className="bottom-(--player-height)! h-auto! border-r-0!">
      <SidebarHeader className="border-sidebar-border h-16 justify-center border-b p-2">
        <Link
          href="/albums"
          onClick={closeOnMobile}
          className="focus-visible:ring-sidebar-ring flex min-w-0 items-center gap-3 rounded-lg px-1 outline-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 focus-visible:ring-2"
        >
          <Mark className="size-8 group-data-[collapsible=icon]:size-7" />
          <p className="t-display min-w-0 text-sm group-data-[collapsible=icon]:hidden">{site.name}</p>
        </Link>
      </SidebarHeader>

      <SidebarContent className="no-scrollbar gap-0 overflow-x-hidden py-2">
        {navigation
          .filter((group) => isAdmin || !group.adminOnly)
          .map((group) => (
            <SidebarGroup key={group.title} className="py-1">
              <SidebarGroupLabel className="t-label text-sidebar-foreground/50 text-[10px]">{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={current === item} tooltip={item.title} className="h-9">
                        <Link href={item.url} onClick={closeOnMobile}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>
    </Sidebar>
  );
}
