"use client";

import { ListPlus, Trash2, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { count } from "~/lib/format";
import type { WebTrack } from "~/server/api/routers/library";
import { AddToPlaylistItems, dropdownKit, QueueActions } from "./track-actions";

/**
 * What can be done with several tracks chosen together, on a strip that
 * comes up over the deck while two or more are chosen. Marked so that using
 * it isn't taken as clicking away from the selection.
 */
export function BulkBar({ tracks, onRemove, onClear }: { tracks: WebTrack[]; onRemove?: () => void; onClear: () => void }) {
  const label = count(tracks.length, "track");
  const chosen = async () => tracks;
  return (
    <div
      data-selection
      role="toolbar"
      aria-label={`${label} selected`}
      className="print animate-rise fixed bottom-[calc(var(--player-height)+0.75rem)] left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-lg border py-1.5 pr-1.5 pl-4 shadow-lg"
    >
      <span className="t-label mr-2 text-[11.5px] whitespace-nowrap tabular-nums">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Queue
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-selection align="center" side="top" className="w-52">
          <QueueActions kit={dropdownKit} tracks={chosen} label={label} />
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <ListPlus />
            <span className="max-sm:sr-only">Add to playlist</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-selection align="center" side="top" className="max-h-72 w-52 overflow-y-auto">
          <AddToPlaylistItems kit={dropdownKit} tracks={chosen} label={label} />
        </DropdownMenuContent>
      </DropdownMenu>
      {onRemove ? (
        <Button variant="outline" size="sm" onClick={onRemove}>
          <Trash2 />
          <span className="max-sm:sr-only">Remove</span>
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" aria-label="Clear the selection" onClick={onClear}>
        <X />
      </Button>
    </div>
  );
}
