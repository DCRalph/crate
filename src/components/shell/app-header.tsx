"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Search, Shield, UserRound } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { authClient } from "~/lib/auth-client";
import { useCrumbLeaf } from "./crumb";
import { navItemFor } from "./navigation";

export type HeaderUser = { name: string; username: string; isAdmin: boolean };

/**
 * Sticky top bar: sidebar toggle, the breadcrumb that doubles as the page
 * title ("Albums / Homework"), search, and the user menu.
 */
export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const leaf = useCrumbLeaf();
  const item = navItemFor(pathname);
  const crumbs: { href: string; label: string }[] = [];
  if (item) crumbs.push({ href: item.url, label: item.title });
  else if (pathname === "/search") crumbs.push({ href: pathname, label: "Search" });
  // A record page (an album, a person) adds its name once it has loaded.
  if (item && pathname !== item.url && leaf) crumbs.push({ href: pathname, label: leaf });

  return (
    <nav className="bg-background/90 sticky top-0 z-40 h-14 w-full shrink-0 border-b backdrop-blur-sm lg:h-16">
      <div className="flex h-full w-full items-center gap-2 px-2 sm:gap-4 sm:px-4 lg:px-6">
        <SidebarTrigger size="icon" className="shrink-0" />
        <Separator orientation="vertical" className="hidden h-8! shrink-0 sm:block" />
        <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                // Phones only get the current page; the trail would crowd it out.
                <span key={crumb.href} className="contents">
                  <BreadcrumbItem className={isLast ? "min-w-0" : "shrink-0 max-sm:hidden"}>
                    {isLast ? (
                      <BreadcrumbPage className="font-title truncate text-lg sm:text-xl lg:text-2xl">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href} className="font-title text-lg text-nowrap sm:text-xl lg:text-2xl">
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {isLast ? null : <BreadcrumbSeparator className="shrink-0 max-sm:hidden" />}
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        {/* Reads the URL's query, which a prerendered shell doesn't have yet. */}
        <Suspense>
          <SearchBox />
        </Suspense>
        <UserMenu user={user} />
      </div>
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
      className="group relative w-36 shrink-0 sm:w-56 lg:w-72"
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
        className="h-8 pr-8 pl-8"
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

function UserMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="hover:bg-foreground/10 flex shrink-0 items-center gap-2 rounded-md p-2 text-sm transition-colors">
          <span className="bg-secondary grid size-7 place-items-center rounded-full text-xs font-semibold uppercase">
            {user.name.charAt(0)}
          </span>
          <span className="hidden max-w-32 truncate font-medium md:block">{user.name}</span>
          <ChevronDown className="text-muted-foreground hidden size-4 md:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col py-2">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{user.username}</span>
          {user.isAdmin ? (
            <span className="mt-1 flex items-center gap-1 text-xs font-medium">
              <Shield className="size-3" />
              Admin
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" className="flex items-center gap-3 py-2">
            <UserRound className="text-muted-foreground size-4" />
            Account
          </Link>
        </DropdownMenuItem>
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
