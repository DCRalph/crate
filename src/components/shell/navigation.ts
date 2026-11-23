import type { LucideIcon } from "lucide-react";
import { Disc3, Heart, History, House, Library, ListMusic, ListTree, MicVocal, Music, SlidersHorizontal, Smartphone, UserRound, Users } from "lucide-react";

export type NavItem = { title: string; url: string; icon: LucideIcon };
export type NavGroup = { title: string; items: NavItem[] };

/** The library: each of these is a tab across the top. */
export const libraryNav: NavItem[] = [
  { title: "Home", url: "/home", icon: House },
  { title: "Albums", url: "/albums", icon: Disc3 },
  { title: "Artists", url: "/artists", icon: MicVocal },
  { title: "Tracks", url: "/tracks", icon: Music },
  { title: "Playlists", url: "/playlists", icon: ListMusic },
  { title: "Liked", url: "/liked", icon: Heart },
];

/** A person's own settings. Reached from the menu under their initial; on these pages they are the second row of tabs. */
export const youNav: NavGroup = {
  title: "You",
  items: [
    { title: "Playback", url: "/account/playback", icon: SlidersHorizontal },
    { title: "Music apps", url: "/account/apps", icon: Smartphone },
    { title: "Account", url: "/account", icon: UserRound },
  ],
};

/** Admin is one tab, for admins only, that opens these as a second row. Folder playlists are set up on each library's page. */
export const adminNav: NavGroup = {
  title: "Admin",
  items: [
    { title: "Users", url: "/admin/users", icon: Users },
    { title: "Libraries", url: "/admin/libraries", icon: Library },
    { title: "All playlists", url: "/admin/playlists", icon: ListTree },
    { title: "Activity", url: "/admin/activity", icon: History },
  ],
};

const groups = [youNav, adminNav];
// Longest address first, so /account/apps is found before /account.
const bySpecificity = [...libraryNav, ...groups.flatMap((group) => group.items)].sort((a, b) => b.url.length - a.url.length);

/** The nav item a path belongs to, for the current tab and the page title. */
export function navItemFor(pathname: string) {
  return bySpecificity.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`));
}

/** The group whose second row a path shows, if it sits in one. */
export function navGroupFor(pathname: string) {
  const item = navItemFor(pathname);
  return item ? groups.find((group) => group.items.includes(item)) : undefined;
}
