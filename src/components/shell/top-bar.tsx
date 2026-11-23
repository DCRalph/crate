"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LogOut, Search } from "lucide-react";

import { usePlayer } from "~/components/player/store";
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
import { cn } from "~/lib/utils";
import { Mark } from "./mark";
import { adminNav, libraryNav, navGroupFor, navItemFor, youNav, type NavItem } from "./navigation";
import { useThemeChoice, type ThemeChoice } from "./theme";

export type HeaderUser = { name: string; username: string; isAdmin: boolean };

/** One page tab. The current one is ivory and stands a little taller, joining the ivory line under the row. */
function Tab({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  // On a phone the row scrolls sideways, so the tab you are on is brought into view.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "t-label focus-visible:ring-ring/60 shrink-0 rounded-t-md px-3.5 pt-2 text-[12.5px] outline-none transition-colors focus-visible:ring-[3px]",
        current ? "bg-strip text-ink pb-[9px]" : "bg-secondary text-foreground/80 hover:text-foreground pb-[7px]",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The top of the app. The library's pages are tabs standing on an ivory
 * line, the way a wallbox turns its pages. Admin is one tab that opens a
 * second row; a person's own settings live under their initial and get the
 * same second row. Phones put the tabs on a line of their own, scrolled
 * sideways.
 */
export function TopBar({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const current = navItemFor(pathname);
  const group = navGroupFor(pathname);
  const playing = usePlayer((state) => state.playing);

  return (
    <header className="bg-muted shrink-0">
      <div className="border-strip flex flex-wrap items-end gap-x-3 border-b-[3px] px-3 pt-2.5 sm:px-4">
        <Link href="/albums" aria-label="Albums" className="focus-visible:ring-ring/60 mb-2 shrink-0 rounded-[3px] outline-none focus-visible:ring-[3px]">
          <Mark lit={playing} />
        </Link>
        <div className="mb-2 flex min-w-0 flex-1 items-center justify-end gap-2 md:order-3 md:flex-none">
          {/* Reads the URL's query, which a prerendered shell doesn't have yet. */}
          <Suspense>
            <SearchBox />
          </Suspense>
          <UserMenu user={user} />
        </div>
        <nav aria-label="Pages" className="no-scrollbar flex w-full items-end gap-1 overflow-x-auto md:order-2 md:w-auto md:flex-1">
          {libraryNav.map((item) => (
            <Tab key={item.url} href={item.url} current={current === item}>
              {item.title}
            </Tab>
          ))}
          {user.isAdmin ? (
            <>
              <span className="min-w-2 flex-1" />
              <Tab href={adminNav.items[0]!.url} current={group === adminNav}>
                {adminNav.title}
              </Tab>
            </>
          ) : null}
        </nav>
      </div>
      {group ? <SubTabs items={group.items} current={current} label={group.title} /> : null}
    </header>
  );
}

/** The second row: the pages inside Admin, or inside a person's own settings. It is print, like the tab it hangs from. */
function SubTabs({ items, current, label }: { items: NavItem[]; current: NavItem | undefined; label: string }) {
  return (
    <nav aria-label={label} className="print no-scrollbar flex h-9 items-stretch gap-5 overflow-x-auto px-4 sm:px-5">
      {items.map((item) => (
        <Link
          key={item.url}
          href={item.url}
          aria-current={current === item ? "page" : undefined}
          className={cn(
            "t-label flex shrink-0 items-center border-y-[3px] border-transparent text-[12px] outline-none transition-colors focus-visible:underline",
            current === item ? "text-foreground border-b-brand" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.title}
        </Link>
      ))}
    </nav>
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
      className="group relative min-w-0 flex-1 md:w-52 md:flex-none lg:w-64"
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
        className="h-[30px] pr-8 pl-8"
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

/** The menu under a person's initial: their own pages, day or night, and signing out. */
function UserMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const [theme, setTheme] = useThemeChoice();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${user.name}: your pages and settings`}
          className="print key focus-visible:ring-ring/60 grid size-[30px] shrink-0 place-items-center rounded-md text-[12.5px] font-bold uppercase outline-none focus-visible:ring-[3px]"
        >
          {user.name.charAt(0)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
