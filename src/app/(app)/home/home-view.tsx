"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AlbumGrid, AlbumGridSkeleton, type AlbumTile } from "~/components/library/album-grid";
import { rowLetters } from "~/components/player/selection";
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
 * is one row that leads to the full list. Each row has a letter, in the
 * order shown, and each tile a code made from it ("B3"), so any tile can be
 * played from the keyboard.
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
      <Page className="flex flex-col gap-9">
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

  // Letters go to the rows that are there, in order, so they always run A, B, C.
  const letters = [...rowLetters];
  const pinnedLetter = pinned.length ? letters.shift() : undefined;
  const row = (title: string, albums: AlbumTile[], all: string) => {
    if (!albums.length) return null;
    const letter = letters.shift();
    return (
      <section>
        <SectionHeading title={title} letter={letter}>
          <Link href={all} className="t-label text-muted-foreground hover:text-foreground text-[11px] outline-none focus-visible:underline">
            See all
          </Link>
        </SectionHeading>
        <AlbumGrid albums={albums} letter={letter} row />
      </section>
    );
  };

  return (
    <Page className="flex flex-col gap-9">
      {pinned.length ? (
        <section>
          <SectionHeading title="Pinned" letter={pinnedLetter}>
            <Link href="/playlists" className="t-label text-muted-foreground hover:text-foreground text-[11px] outline-none focus-visible:underline">
              All playlists
            </Link>
          </SectionHeading>
          <PlaylistGrid tree={noTree} flat={pinned} letter={pinnedLetter} row />
        </section>
      ) : null}
      {row("Jump back in", recent, "/albums?sort=recent")}
      {row("Recently added", added, "/albums")}
      {row("Most played", frequent, "/albums?sort=frequent")}
    </Page>
  );
}
