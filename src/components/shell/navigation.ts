import type { LucideIcon } from "lucide-react";
import { Disc3, FolderTree, Heart, History, Library, ListMusic, ListTree, MicVocal, SlidersHorizontal, Smartphone, UserRound, Users } from "lucide-react";

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
    items: [
      { title: "Playback", url: "/account/playback", icon: SlidersHorizontal },
      { title: "Music apps", url: "/account/apps", icon: Smartphone },
      { title: "Account", url: "/account", icon: UserRound },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    items: [
      { title: "Users", url: "/admin/users", icon: Users },
      { title: "Libraries", url: "/admin/libraries", icon: Library },
      { title: "Folder playlists", url: "/admin/folder-playlists", icon: FolderTree },
      { title: "All playlists", url: "/admin/playlists", icon: ListTree },
      { title: "Activity", url: "/admin/activity", icon: History },
    ],
  },
];

const navItems = navigation.flatMap((group) => group.items);

// Longest address first, so /account/apps is found before /account.
const bySpecificity = [...navItems].sort((a, b) => b.url.length - a.url.length);

/** The nav item a path belongs to, for the sidebar highlight and the breadcrumb. */
export function navItemFor(pathname: string) {
  return bySpecificity.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`));
}
