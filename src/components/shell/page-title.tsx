"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { useCrumbLeaf } from "./crumb";
import { navItemFor } from "./navigation";

/** Pages that are not tabs but still open with a title. */
const untabbedPages: Partial<Record<string, string>> = { "/search": "Search", "/most-played": "Most played" };

/**
 * A page's title, worked out from where it is: the tab it belongs to, then
 * the name a record page announces through `PageCrumb` ("Libraries, Main").
 * As a heading it is the page's large title. As a trail it is the way back
 * in small capitals, for pages with a headline of their own.
 */
export function PageTitle({ variant, detail, actions }: { variant: "heading" | "trail"; detail?: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  const leaf = useCrumbLeaf();
  const item = navItemFor(pathname);
  const untabbed = untabbedPages[pathname];
  const section = item ? { href: item.url, label: item.title } : untabbed ? { href: pathname, label: untabbed } : null;
  if (!section) return null;
  const onRecord = item !== undefined && pathname !== item.url;

  if (variant === "trail") {
    return (
      <p className="t-label text-muted-foreground mb-2.5 flex items-center gap-1 text-[11.5px] sm:mb-4">
        <Link href={section.href} className="hover:text-foreground outline-none focus-visible:underline">
          {section.label}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
      </p>
    );
  }
  return (
    <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 sm:mb-4 sm:min-h-9">
      <h1 className="font-title flex min-w-0 flex-wrap items-baseline gap-x-2 text-[24px] sm:text-[30px]">
        {onRecord ? (
          <>
            <Link href={section.href} className="text-muted-foreground hover:text-foreground outline-none focus-visible:underline">
              {section.label}
            </Link>
            {/* The record's own name arrives with its data. */}
            {leaf ? <span className="min-w-0 break-words">{leaf}</span> : null}
          </>
        ) : (
          section.label
        )}
      </h1>
      {detail ? <span className="text-muted-foreground text-sm tabular-nums">{detail}</span> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
