"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CornerLeftUp, Folder } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useTRPC } from "~/trpc/react";

/**
 * Walks the server's folders so a path can be picked instead of typed.
 * Opening a folder makes it the value; `value` only decides where it starts.
 * It can start in, or wander into, a folder the server can't open (one that
 * has moved, say), so the way up is worked out here when the server has none to give.
 */
export function FolderBrowser({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const trpc = useTRPC();
  const [at, setAt] = useState(value.startsWith("/") ? value : "/");
  const here = useQuery(trpc.admin.libraries.browse.queryOptions({ path: at }, { retry: false, placeholderData: keepPreviousData }));
  const parent = here.isError ? (at === "/" ? null : at.slice(0, at.lastIndexOf("/")) || "/") : (here.data?.parent ?? null);
  const go = (path: string) => {
    setAt(path);
    onChange(path);
  };

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{here.isError ? at : (here.data?.path ?? at)}</code>
        <Button type="button" variant="ghost" size="xs" disabled={!parent} onClick={() => parent && go(parent)}>
          <CornerLeftUp />
          Up
        </Button>
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {here.isError ? (
          <li className="text-destructive px-2 py-1.5 text-sm">{here.error.message}</li>
        ) : here.data && !here.data.folders.length ? (
          <li className="text-muted-foreground px-2 py-1.5 text-sm">No folders in here.</li>
        ) : (
          here.data?.folders.map((folder) => (
            <li key={folder.path}>
              <button
                type="button"
                onClick={() => go(folder.path)}
                className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]"
              >
                <Folder className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
