"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronsUpDown, Folder, Keyboard, ListMusic, LogOut, Search, Settings2 } from "lucide-react";

import { useShortcutsHelp } from "~/components/player/shortcuts";
import { forgetQueue, usePlayer } from "~/components/player/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { authClient } from "~/lib/auth-client";
import { site } from "~/lib/site";
import { buildTree, itemsUnder, type Tree } from "~/lib/tree";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { Mark } from "./mark";
import { adminNav, libraryNav, navGroupFor, navItemFor, youNav, type NavItem } from "./navigation";
import { useThemeChoice, type ThemeChoice } from "./theme";

export type HeaderUser = { name: string; username: string; isAdmin: boolean };

/**
 * Sits inside a link and marks it while the page it leads to is on its way,
 * so a key can light the moment it is pressed and not when the page lands.
 */
function Pending() {
  return useLinkStatus().pending ? <span data-pending hidden /> : null;
}

/** Admin is one key on the rail; the pages inside it are a row across the top of the glass. */
const adminKey: NavItem = { title: adminNav.title, url: adminNav.items[0]!.url, icon: Settings2 };

/**
 * One page key on the rail. The current one is an ivory key standing out of
 * the enamel; the rest are lettered on it. A key pressed whose page is still
 * on its way is shaded, so only one key is ever lit. On a phone the keys run in a row
 * that scrolls sideways, and the one you are on is brought into view.
 */
function RailKey({ item, current }: { item: NavItem; current: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <Link
      ref={ref}
      href={item.url}
      aria-current={current ? "page" : undefined}
      className={cn(
        // No fade between states: the lit key changes at once, with the page, so two keys never look half lit.
        "t-label focus-visible:ring-ring/60 flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[12px] outline-none focus-visible:ring-[3px] md:h-[34px] md:text-[12.5px]",
        current
          ? "print key"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground has-data-pending:bg-accent has-data-pending:text-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {item.title}
      <Pending />
    </Link>
  );
}

/**
 * The rail down the side of the cabinet: the badge, search, the pages, your
 * pinned playlists and your playlist tree, Admin, and the menu under your
 * name. On a phone it folds into a bar across the top (badge, search, your
 * initial) with the page keys in a row under it; the playlists are on their
 * own page there.
 */
export function Rail({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const current = navItemFor(pathname);
  const group = navGroupFor(pathname);
  const playing = usePlayer((state) => state.playing);

  return (
    <aside
      aria-label={site.name}
      // A phone on its side has little height, so there the bar is one row: badge, pages, search, you.
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 px-3 pt-2.5 pb-1 max-md:short:grid-cols-[auto_minmax(0,1fr)_minmax(0,11rem)_auto] max-md:short:py-1.5 md:no-scrollbar md:flex md:min-h-0 md:flex-col md:items-stretch md:gap-0 md:overflow-y-auto md:px-3 md:pt-3 md:pb-3"
    >
      <Link href="/home" aria-label={`${site.name}, home`} className="focus-visible:ring-ring/60 shrink-0 rounded-[3px] outline-none focus-visible:ring-[3px] md:mb-4 md:self-start">
        <Mark lit={playing} />
      </Link>
      {/* Reads the URL's query, which a prerendered shell doesn't have yet. */}
      <Suspense fallback={<div className="h-[30px]" />}>
        <SearchBox />
      </Suspense>
      <div className="max-md:short:col-start-4 max-md:short:row-start-1 md:order-last md:mt-2 md:border-t md:pt-2">
        <UserMenu user={user} current={group === youNav} />
      </div>
      <nav
        aria-label="Pages"
        className="no-scrollbar col-span-3 -mx-3 flex gap-1 overflow-x-auto px-3 pb-1 max-md:short:col-span-1 max-md:short:col-start-2 max-md:short:row-start-1 max-md:short:mx-0 max-md:short:px-0 max-md:short:pb-0 md:mx-0 md:mt-3 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0"
      >
        {libraryNav.map((item) => (
          <RailKey key={item.url} item={item} current={current === item} />
        ))}
        {user.isAdmin ? (
          <span className="contents md:hidden">
            <RailKey item={adminKey} current={group === adminNav} />
          </span>
        ) : null}
      </nav>
      <RailPlaylists className="max-md:hidden" />
      {user.isAdmin ? (
        <div className="mt-2 max-md:hidden">
          <RailKey item={adminKey} current={group === adminNav} />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * The second row, for the pages inside Admin or inside a person's own
 * settings. It is print, across the top of the glass, and only there while
 * one of those pages is open.
 */
export function GroupTabs() {
  const pathname = usePathname();
  const group = navGroupFor(pathname);
  const current = navItemFor(pathname);
  if (!group) return null;
  return (
    <nav aria-label={group.title} className="print no-scrollbar flex h-10 shrink-0 items-stretch gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8">
      {group.items.map((item) => (
        <Link
          key={item.url}
          href={item.url}
          aria-current={current === item ? "page" : undefined}
          className={cn(
            "t-label flex shrink-0 items-center border-y-[3px] border-transparent text-[12px] outline-none transition-colors focus-visible:underline",
            current === item ? "text-foreground border-b-brand" : "text-muted-foreground hover:text-foreground has-data-pending:text-foreground has-data-pending:border-b-brand",
          )}
        >
          {item.title}
          <Pending />
        </Link>
      ))}
    </nav>
  );
}

type FolderRow = RouterOutputs["playlists"]["tree"]["folders"][number];
type PlaylistRow = RouterOutputs["playlists"]["tree"]["playlists"][number];
type Level = Tree<FolderRow, PlaylistRow>;

// Which folders are open in the rail's tree. Kept in memory, and in the browser where it allows, so the tree comes
// back the way it was left. A browser that refuses storage still opens and closes folders for the visit.
const openKey = "crate-rail-open";
const openChanged = "crate-rail-open-change";
let openSaved: string | null = null;
function readOpen(): string {
  if (openSaved === null) {
    try {
      openSaved = window.localStorage.getItem(openKey) ?? "[]";
    } catch {
      openSaved = "[]";
    }
  }
  return openSaved;
}
function subscribeOpen(notify: () => void) {
  // Another tab opening or closing a folder: take its list, so a toggle here doesn't write over it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== openKey) return;
    openSaved = event.newValue ?? "[]";
    notify();
  };
  window.addEventListener(openChanged, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(openChanged, notify);
    window.removeEventListener("storage", onStorage);
  };
}
/** The folders open in the rail, and a way to open or close one. */
function useOpenFolders() {
  const saved = useSyncExternalStore(subscribeOpen, readOpen, () => "[]");
  const open = useMemo(() => {
    try {
      return new Set<number>(JSON.parse(saved) as number[]);
    } catch {
      return new Set<number>();
    }
  }, [saved]);
  const toggle = (id: number) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    openSaved = JSON.stringify([...next]);
    try {
      window.localStorage.setItem(openKey, openSaved);
    } catch {
      // Private windows can refuse storage; the tree then only remembers for this visit.
    }
    window.dispatchEvent(new Event(openChanged));
  };
  return [open, toggle] as const;
}

const railRow =
  "focus-visible:ring-ring/60 flex h-7 min-w-0 items-center gap-2 rounded-md pr-2 text-[13px] outline-none transition-colors focus-visible:ring-[3px]";

/**
 * Your playlists on the rail, always in reach: the ones you pinned, then the
 * whole tree with folders that open in place (and stay open, in this
 * browser). A lamp is lit beside the playlist that is playing, and beside
 * every closed folder it is in.
 */
function RailPlaylists({ className }: { className?: string }) {
  const trpc = useTRPC();
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const pathname = usePathname();
  const sounding = usePlayer((state) => (state.playing ? state.from : null));
  const [open, toggle] = useOpenFolders();
  const nested = useMemo(
    () =>
      buildTree(tree.data?.folders ?? [], tree.data?.playlists ?? [], {
        of: (folder) => folder.id,
        parent: (folder) => folder.parentId,
        place: (playlist) => playlist.folderId,
      }),
    [tree.data],
  );
  const pinned = (tree.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);
  const playingId = sounding?.startsWith("playlist:") ? Number(sounding.slice("playlist:".length)) : null;

  /** A playlist's row, its icon `indent` rem in from the rail's edge. */
  const playlistLink = (playlist: PlaylistRow, indent: number) => {
    const here = pathname === `/playlists/${playlist.id}`;
    return (
      <li key={playlist.id}>
        <Link
          href={`/playlists/${playlist.id}`}
          aria-current={here ? "page" : undefined}
          style={{ paddingLeft: `${indent}rem` }}
          className={cn(railRow, here ? "bg-accent text-foreground" : "text-foreground/85 hover:bg-accent/60 hover:text-foreground")}
        >
          <ListMusic className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
          {playingId === playlist.id ? <span className="lamp" data-lit aria-label="Playing" /> : null}
        </Link>
      </li>
    );
  };

  const level = (node: Level, depth: number): React.ReactNode => (
    <>
      {node.folders.map((child) => {
        const id = child.folder.id;
        const isOpen = open.has(id);
        const lit = playingId !== null && itemsUnder(child).some((playlist) => playlist.id === playingId);
        return (
          <li key={`f${id}`}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(id)}
              className={cn(railRow, "text-foreground/85 hover:bg-accent/60 hover:text-foreground w-full text-left")}
              style={{ paddingLeft: `${0.625 + depth * 0.875}rem` }}
            >
              <Folder className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{child.folder.name}</span>
              {lit && !isOpen ? <span className="lamp" data-lit aria-label="Playing inside" /> : null}
              <ChevronRight className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform duration-150", isOpen && "rotate-90")} aria-hidden />
            </button>
            {isOpen ? <ul>{level(child, depth + 1)}</ul> : null}
          </li>
        );
      })}
      {/* Under the folders, their icons in line with the folders' and the page keys' icons. */}
      {node.items.map((playlist) => playlistLink(playlist, 0.625 + depth * 0.875))}
    </>
  );

  return (
    <div className={cn("no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto border-t pb-2 short:min-h-fit short:flex-none short:overflow-visible", className)}>
      {tree.data && pinned.length ? (
        <section>
          <h2 className="t-label text-muted-foreground mt-4 mb-1.5 px-2.5 text-[10.5px] tracking-[0.08em]">Pinned</h2>
          <ul>{pinned.map((playlist) => playlistLink(playlist, 0.625))}</ul>
        </section>
      ) : null}
      {tree.data && (nested.folders.length || nested.items.length) ? (
        <section>
          <h2 className="t-label text-muted-foreground mt-4 mb-1.5 px-2.5 text-[10.5px] tracking-[0.08em]">Playlists</h2>
          <ul>{level(nested, 0)}</ul>
        </section>
      ) : null}
    </div>
  );
}


/**
 * Searches as you type: results live at /search?q=. Pressing "/" anywhere
 * jumps to the box, Escape clears it, and it empties itself once you
 * navigate away from the results.
 */
function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onSearch = pathname === "/search";
  const query = onSearch ? (params.get("q") ?? "") : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(query ?? "");
  /** Searches this box sent itself, so their arrival in the URL isn't mistaken for Back or Forward. */
  const [sent, setSent] = useState<string[]>([]);

  // When the page changes under the box, follow it: Back to an older search
  // shows that search's text, and leaving the results empties the box. Our own
  // searches landing in the URL are left alone, or they'd undo newer typing.
  const place = query === null ? pathname : `search:${query}`;
  const [seen, setSeen] = useState(place);
  /** Counts the times the page changed under the box other than by its own search. */
  const [navigations, setNavigations] = useState(0);
  if (place !== seen) {
    setSeen(place);
    const ours = query !== null && sent.includes(query);
    if (!ours) {
      setValue(query ?? "");
      setNavigations(navigations + 1);
    }
    // Forgotten on the way out, so coming Back to one of these searches counts as navigation.
    if (query === null) setSent([]);
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A search still waiting to be sent is dropped when the page changes by other
  // means (or the box goes away), so it can't fire and replace the page you went to.
  useEffect(() => () => clearTimeout(timer.current), [navigations]);
  // The same, sooner: a slow page can take longer to arrive than the search takes
  // to send, so the wait is also dropped the moment a link is clicked or Back is pressed.
  useEffect(() => {
    const cancel = () => clearTimeout(timer.current);
    const onClick = (event: MouseEvent) => {
      // A click that opens the link elsewhere (new tab, new window) leaves this page where it is.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("a[href]")) cancel();
    };
    window.addEventListener("popstate", cancel);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", cancel);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (text: string, wait: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = text.trim();
      if (!onSearch && !next) return;
      setSent((recent) => [...recent.slice(-4), next]);
      const url = `/search?q=${encodeURIComponent(next)}`;
      // Typing more shouldn't add a history entry per letter.
      if (onSearch) router.replace(url);
      else router.push(url);
    }, wait);
  };
  const change = (text: string, wait: number) => {
    setValue(text);
    go(text, wait);
  };

  return (
    <form
      role="search"
      className="group relative min-w-0 flex-1 max-md:short:col-start-3 max-md:short:row-start-1 md:flex-none"
      onSubmit={(event) => {
        event.preventDefault();
        go(value, 0);
      }}
    >
      <Search className="text-muted-foreground group-focus-within:text-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 transition-colors" />
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search"
        aria-keyshortcuts="/"
        placeholder="Search"
        className="h-[30px] pr-8 pl-8 shadow-[inset_0_1px_3px_rgb(0_0_0/0.22)]"
        value={value}
        onChange={(event) => change(event.target.value, 250)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (value) change("", 0);
          else event.currentTarget.blur();
        }}
      />
      {/* The shortcut, shown until the box is in use. Hidden where there is no keyboard. */}
      {value ? null : (
        <kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-sm border font-sans text-[11px] group-focus-within:hidden max-sm:hidden pointer-coarse:hidden">
          /
        </kbd>
      )}
    </form>
  );
}

const themes: { value: ThemeChoice; label: string }[] = [
  { value: "auto", label: "Match the device" },
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
];

/**
 * The menu under a person's name, at the foot of the rail (on a phone, their
 * initial at the end of the bar): their own pages, day or night, and signing
 * out. `current` lights it while one of their own pages is open.
 */
function UserMenu({ user, current }: { user: HeaderUser; current: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useThemeChoice();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${user.name}: your pages and settings`}
          className={cn(
            "group/user focus-visible:ring-ring/60 flex min-w-0 items-center gap-2.5 rounded-md text-left outline-none transition-colors focus-visible:ring-[3px] md:w-full md:p-1 md:pr-2",
            current ? "md:bg-accent" : "md:hover:bg-accent/60 md:data-[state=open]:bg-accent/60",
          )}
        >
          <span className="print key grid size-[30px] shrink-0 place-items-center rounded-md text-[12.5px] font-bold uppercase">{user.name.charAt(0)}</span>
          <span className="min-w-0 flex-1 max-md:hidden">
            <span className="block truncate text-[13px] leading-tight font-medium">{user.name}</span>
            <span className="text-muted-foreground block truncate text-[11.5px] leading-tight">{user.isAdmin ? "Admin" : user.username}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0 max-md:hidden" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="flex flex-col py-2">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user.username}
            {user.isAdmin ? " · Admin" : ""}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {youNav.items.map((item) => (
          <DropdownMenuItem key={item.url} asChild>
            <Link href={item.url} className="flex items-center gap-3 py-2">
              <item.icon className="text-muted-foreground size-4" />
              {item.title}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="flex items-center gap-3 py-2 pointer-coarse:hidden" onSelect={() => useShortcutsHelp.setState({ open: true })}>
          <Keyboard className="text-muted-foreground size-4" />
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="t-label text-muted-foreground text-[11px]">Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeChoice)}>
          {themes.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center gap-3 py-2"
          onSelect={async () => {
            await authClient.signOut();
            // The next person to sign in on this browser shouldn't find this one's queue on the deck, or their
            // lists still in memory.
            forgetQueue();
            queryClient.clear();
            router.push("/signin");
            router.refresh();
          }}
        >
          <LogOut className="text-muted-foreground size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
