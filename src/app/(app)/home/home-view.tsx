"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton, type AlbumTile } from "~/components/library/album-grid";
import { PlaylistGrid } from "~/components/playlists/playlist-grid";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { useTRPC } from "~/trpc/react";

/** A playlist grid with no folders of its own, for showing a plain list of playlists. */
const noTree = { folders: [], items: [] };

/**
 * Where the app opens: the playlists this person pinned, the albums they
 * last played, what is newest in the library, and what they play most. Each
 * is one row that leads to the full list. Nothing here is numbered, since
 * there are several lists and a typed number could mean any of them.
 */
export function HomeView({ isAdmin }: { isAdmin: boolean }) {
  const trpc = useTRPC();
  const home = useQuery(trpc.library.home.queryOptions());
  const playlists = useQuery(trpc.playlists.tree.queryOptions());
  const pinned = (playlists.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);

  if (home.isError) {
    return (
      <Page>
        <LoadError error={home.error} />
      </Page>
    );
  }
  if (!home.data) {
    return (
      <Page className="flex flex-col gap-8">
        {["Jump back in", "Recently added"].map((title) => (
          <section key={title}>
            <SectionHeading title={title} />
            <AlbumGridSkeleton count={6} row />
          </section>
        ))}
      </Page>
    );
  }
  const { recent, added, frequent } = home.data;
  if (!added.length) {
    return (
      <Page>
        {isAdmin ? (
          <Empty
            action={
              <Button asChild variant="brand">
                <Link href="/admin/libraries">Add a library</Link>
              </Button>
            }
          >
            The crate is empty. Point it at a folder of music and it fills itself.
          </Empty>
        ) : (
          <Empty>The crate is empty. Ask whoever runs this server for a library.</Empty>
        )}
      </Page>
    );
  }

  // An album can be in more than one row, and its cover can only travel to its page from one of them: the first.
  const shown = new Set<number>();
  const row = (title: string, albums: AlbumTile[], all: string) => {
    if (!albums.length) return null;
    const firstTime = new Set(albums.filter((album) => !shown.has(album.id)).map((album) => album.id));
    for (const id of firstTime) shown.add(id);
    return (
      <section>
        <SectionHeading title={title}>
          <Link href={all} className="t-label text-muted-foreground hover:text-foreground text-[11px] outline-none focus-visible:underline">
            See all
          </Link>
        </SectionHeading>
        <AlbumGrid albums={albums} numbered={false} row shared={(id) => firstTime.has(id)} />
      </section>
    );
  };

  return (
    <Page className="flex flex-col gap-8">
      {pinned.length ? (
        <section>
          <SectionHeading title="Pinned">
            <Link href="/playlists" className="t-label text-muted-foreground hover:text-foreground text-[11px] outline-none focus-visible:underline">
              All playlists
            </Link>
          </SectionHeading>
          <PlaylistGrid tree={noTree} flat={pinned} numbered={false} row />
        </section>
      ) : null}
      {row("Jump back in", recent, "/albums?sort=recent")}
      {row("Recently added", added, "/albums")}
      {row("Most played", frequent, "/albums?sort=frequent")}
    </Page>
  );
}
