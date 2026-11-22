"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { NewPlaylistDialog } from "~/components/library/new-playlist-dialog";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count, formatLength } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";

/** The user's playlists, public ones from others, and the ones built from folders. */
export function PlaylistsView() {
  const trpc = useTRPC();
  const router = useRouter();
  const playlists = useQuery(trpc.playlists.list.queryOptions());
  const [creating, setCreating] = useState(false);
  const newButton = (
    <Button variant="brand" size="sm" onClick={() => setCreating(true)}>
      <Plus />
      New playlist
    </Button>
  );

  return (
    <Page maxWidth="max-w-5xl">
      <SectionHeading title="All playlists" detail={playlists.data ? count(playlists.data.length, "playlist") : null}>
        {newButton}
      </SectionHeading>
      {playlists.isPending ? (
        <Skeleton className="h-40" />
      ) : playlists.isError ? (
        <LoadError message={playlists.error.message} />
      ) : playlists.data.length === 0 ? (
        <Empty action={newButton}>No playlists yet. Start one, or add tracks to a new one from any track&apos;s menu.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>Name</TableHead>
              <TableHead className={`${head} text-right`}>Tracks</TableHead>
              <TableHead className={`${head} text-right max-sm:hidden`}>Length</TableHead>
              <TableHead className={`${head} max-sm:hidden`}>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playlists.data.map((playlist) => (
              <TableRow key={playlist.id} className="cursor-pointer" onClick={() => router.push(`/playlists/${playlist.id}`)}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {/* The row is clickable for the mouse; this link is the same destination for the keyboard. */}
                    <Link href={`/playlists/${playlist.id}`} className="truncate font-medium outline-none hover:underline focus-visible:underline" onClick={(event) => event.stopPropagation()}>
                      {playlist.name}
                    </Link>
                    {/* A fixed fact about where it comes from, so a badge rather than a status. */}
                    {playlist.readOnly ? <Badge variant="outline">Folder</Badge> : null}
                    {playlist.isPublic && !playlist.readOnly ? <Badge variant="outline">Public</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">{playlist.trackCount}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums max-sm:hidden">{formatLength(playlist.duration)}</TableCell>
                <TableCell className="text-muted-foreground max-sm:hidden">{playlist.isMine ? "You" : playlist.ownerName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NewPlaylistDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
