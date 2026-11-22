import type { LucideIcon } from "lucide-react";
import { Disc3, FolderTree, Heart, History, Library, ListMusic, MicVocal, UserRound, Users } from "lucide-react";

export type NavItem = { title: string; url: string; icon: LucideIcon };
export type NavGroup = { title: string; adminOnly: boolean; items: NavItem[] };

/** Sidebar groups. Admin-only groups are hidden from everyone else. */
export const navigation: NavGroup[] = [
  {
    title: "Library",
    adminOnly: false,
    items: [
      { title: "Albums", url: "/albums", icon: Disc3 },
      { title: "Artists", url: "/artists", icon: MicVocal },
      { title: "Playlists", url: "/playlists", icon: ListMusic },
      { title: "Liked", url: "/liked", icon: Heart },
    ],
  },
  {
    title: "You",
    adminOnly: false,
    items: [{ title: "Account", url: "/account", icon: UserRound }],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
      { title: "Users", url: "/admin/users", icon: Users },
      { title: "Libraries", url: "/admin/libraries", icon: Library },
      { title: "Folder playlists", url: "/admin/folder-playlists", icon: FolderTree },
      { title: "Activity", url: "/admin/activity", icon: History },
    ],
  },
];

const navItems = navigation.flatMap((group) => group.items);

/** The nav item a path belongs to, for the sidebar highlight and the breadcrumb. */
export function navItemFor(pathname: string) {
  return navItems.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`));
}
