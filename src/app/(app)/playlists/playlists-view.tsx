"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Folder, FolderPlus, LayoutGrid, ListMusic, ListTree, MoreHorizontal, Pin, Plus, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { PlaylistGrid, PlaylistGridSkeleton } from "~/components/playlists/playlist-grid";
import { PlaylistInfoDialog } from "~/components/playlists/playlist-info";
import { usePin } from "~/components/playlists/use-pin";
import { usePendingTracks } from "~/components/library/pending-tracks";
import { usePlaylistsLayout } from "~/components/playlists/view";
import { Page } from "~/components/shell/page";
import { Empty, LoadError } from "~/components/shell/states";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { count, formatLength } from "~/lib/format";
import { defaultPlayRange } from "~/lib/most-played";
import { buildTree, itemsUnder, type Tree, type TreeNode } from "~/lib/tree";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { RowsSkeleton } from "~/components/shell/skeletons";

type FolderRow = RouterOutputs["playlists"]["tree"]["folders"][number];
type PlaylistRow = RouterOutputs["playlists"]["tree"]["playlists"][number];
type Node = TreeNode<FolderRow, PlaylistRow>;

const columns = "grid grid-cols-[minmax(0,1fr)_4rem_2rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_4rem_6.5rem_7rem_2rem]";
const head = "t-label text-[11.5px]";

/** Keeps what matches `text`: a matching folder with everything in it, or just the playlists that match and the folders leading to them. */
function matching(level: Tree<FolderRow, PlaylistRow>, text: string): Tree<FolderRow, PlaylistRow> {
  const has = (name: string) => name.toLowerCase().includes(text);
  return {
    items: level.items.filter((item) => has(item.name)),
    folders: level.folders.flatMap((node) => {
      if (has(node.folder.name)) return [node];
      const inside = matching(node, text);
      return inside.items.length || inside.folders.length ? [{ ...node, ...inside }] : [];
    }),
  };
}

/**
 * Playlists, as a tree or as big covers. Folders hold folders and playlists,
 * and a playlist is always a leaf. Ones that follow a folder on disk are
 * marked and can't be changed here; everything else is the person's own to
 * arrange. Most played, made from the person's own plays, comes before
 * everything, then the playlists they have pinned, in either layout.
 */
export function PlaylistsView() {
  const trpc = useTRPC();
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const [filter, setFilter] = useState("");
  const [layout, setLayout] = usePlaylistsLayout();
  // Folders start open at the top level and closed below; this holds the ones the person has flipped.
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(new Set());

  const nested = useMemo(
    () =>
      buildTree(tree.data?.folders ?? [], tree.data?.playlists ?? [], {
        of: (folder) => folder.id,
        parent: (folder) => folder.parentId,
        place: (playlist) => playlist.folderId,
      }),
    [tree.data],
  );
  const text = filter.trim().toLowerCase();
  const shown = text ? matching(nested, text) : nested;
  const pinned = text ? [] : (tree.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);
  const showMostPlayed = "most played".includes(text);
  const isOpen = (id: number, depth: number) => !!text || (depth === 0) !== flipped.has(id);
  const flip = (id: number) =>
    setFlipped((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const actions = (
    <>
      <Button variant="secondary" size="sm" asChild>
        <Link href="/playlists/folders/new">
          <FolderPlus />
          New folder
        </Link>
      </Button>
      <Button variant="brand" size="sm" asChild>
        <Link href="/playlists/new" onClick={() => usePendingTracks.getState().clear()}>
          <Plus />
          New playlist
        </Link>
      </Button>
    </>
  );

  return (
    <Page maxWidth="max-w-5xl" detail={tree.data ? count(tree.data.playlists.length, "playlist") : null} actions={actions}>
      {tree.isPending ? (
        layout === "grid" ? (
          <PlaylistGridSkeleton />
        ) : (
          <RowsSkeleton rows={8} />
        )
      ) : tree.isError ? (
        <LoadError error={tree.error} />
      ) : !tree.data.playlists.length && !tree.data.folders.length ? (
        <Empty>No playlists yet. Start one here, or add tracks to a new one from any track&apos;s menu.</Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input aria-label="Find a playlist or folder" placeholder="Find a playlist or folder" className="pl-9" value={filter} onChange={(event) => setFilter(event.target.value)} />
            </div>
            <div role="group" aria-label="Layout" className="ml-auto flex gap-1">
              <Button variant={layout === "tree" ? "default" : "outline"} size="icon" aria-label="Show as a list" aria-pressed={layout === "tree"} onClick={() => setLayout("tree")}>
                <ListTree />
              </Button>
              <Button variant={layout === "grid" ? "default" : "outline"} size="icon" aria-label="Show as covers" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>
                <LayoutGrid />
              </Button>
            </div>
          </div>
          {layout === "grid" ? (
            // A search shows the playlists that match, wherever they sit.
            <PlaylistGrid
              tree={nested}
              flat={text ? tree.data.playlists.filter((playlist) => playlist.name.toLowerCase().includes(text)) : undefined}
              mostPlayed={showMostPlayed}
            />
          ) : (
          <div className="print overflow-hidden rounded-lg pb-1 shadow-[0_1px_2px_rgb(0_0_0/0.14)]">
            <div className={cn(columns, "bg-brand h-8 px-4")} aria-hidden>
              <span className={head}>Name</span>
              <span className={cn(head, "text-right")}>Tracks</span>
              <span className={cn(head, "text-right max-sm:hidden")}>Length</span>
              <span className={cn(head, "max-sm:hidden")}>Owner</span>
              <span />
            </div>
            <div className="animate-arrive">
              {showMostPlayed ? <MostPlayedLine /> : null}
              {/* Pinned playlists first. One inside a folder is still in its place below as well. */}
              {pinned.map((playlist) => (
                <PlaylistLine key={`pin${playlist.id}`} playlist={playlist} depth={0} />
              ))}
              {/* A pinned playlist that sits at the top level is already above, so it isn't listed twice. */}
              <Level level={text ? shown : { ...shown, items: shown.items.filter((playlist) => !playlist.pinnedAt) }} depth={0} isOpen={isOpen} onFlip={flip} />
              {text && !showMostPlayed && !shown.items.length && !shown.folders.length ? <p className="text-muted-foreground px-4 py-6 text-sm">Nothing called that.</p> : null}
            </div>
          </div>
          )}
        </>
      )}
    </Page>
  );
}

function Level({ level, depth, isOpen, onFlip }: { level: Tree<FolderRow, PlaylistRow>; depth: number; isOpen: (id: number, depth: number) => boolean; onFlip: (id: number) => void }) {
  return (
    <>
      {level.folders.map((node) => (
        <FolderRows key={`f${node.folder.id}`} node={node} depth={depth} isOpen={isOpen} onFlip={onFlip} />
      ))}
      {level.items.map((playlist) => (
        <PlaylistLine key={`p${playlist.id}`} playlist={playlist} depth={depth} />
      ))}
    </>
  );
}

/** Pushes a row's name in by its depth, with room where a folder has its chevron so names line up. */
const indent = (depth: number) => ({ paddingLeft: `${depth * 1.25}rem` });

function FolderRows({ node, depth, isOpen, onFlip }: { node: Node; depth: number; isOpen: (id: number, depth: number) => boolean; onFlip: (id: number) => void }) {
  const { folder } = node;
  const open = isOpen(folder.id, depth);
  const inside = useMemo(() => itemsUnder(node), [node]);
  const tracks = inside.reduce((sum, playlist) => sum + playlist.trackCount, 0);
  const seconds = inside.reduce((sum, playlist) => sum + playlist.duration, 0);

  return (
    <>
      <div className={cn(columns, "hover:bg-accent min-h-10 border-b px-4 text-sm transition-colors")}>
        <div className="flex min-w-0 items-center gap-2" style={indent(depth)}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => onFlip(folder.id)}
            className="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-sm py-2 text-left outline-none focus-visible:ring-[3px]"
          >
            <ChevronRight className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-150", open && "rotate-90")} />
            <Folder className="text-muted-foreground size-4 shrink-0" />
            <span className="t-label truncate text-[13px] leading-normal">{folder.name}</span>
            {folder.fromDisk ? <Badge variant="outline">From disk</Badge> : null}
          </button>
        </div>
        <span className="text-muted-foreground text-right tabular-nums">{tracks}</span>
        <span className="text-muted-foreground text-right tabular-nums max-sm:hidden">{formatLength(seconds)}</span>
        <span className="text-muted-foreground truncate max-sm:hidden">{folder.isMine ? "You" : folder.ownerName}</span>
        {folder.isMine || folder.canEdit ? <FolderMenu folder={folder} /> : <span />}
      </div>
      {open ? (
        node.folders.length || node.items.length ? (
          <Level level={node} depth={depth + 1} isOpen={isOpen} onFlip={onFlip} />
        ) : (
          <p className="text-muted-foreground border-b px-4 py-2.5 text-sm" style={indent(depth + 1)}>
            <span className="pl-6">Empty</span>
          </p>
        )
      ) : null}
    </>
  );
}

function FolderMenu({ folder }: { folder: FolderRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${folder.name}`} className="text-muted-foreground">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {folder.canEdit ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/playlists/new?folder=${folder.id}`} onClick={() => usePendingTracks.getState().clear()}>
                New playlist here
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/playlists/folders/new?parent=${folder.id}`}>New folder here</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/playlists/folders/${folder.id}`}>{folder.canEdit ? "Edit folder" : "About this folder"}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The row for Most played at the top of the list, opening the person's own most played tracks. */
function MostPlayedLine() {
  const trpc = useTRPC();
  const mostPlayed = useQuery(trpc.library.mostPlayed.queryOptions({ range: defaultPlayRange }));
  const tracks = mostPlayed.data;

  return (
    <div className={cn(columns, "hover:bg-accent min-h-10 border-b px-4 text-sm transition-colors")}>
      <div className="flex min-w-0 items-center gap-2 py-2">
        <TrendingUp className="text-muted-foreground ml-6 size-4 shrink-0" />
        <Link href="/most-played" className="truncate outline-none hover:underline focus-visible:underline">
          Most played
        </Link>
      </div>
      <span className="text-muted-foreground text-right tabular-nums">{tracks?.length}</span>
      <span className="text-muted-foreground text-right tabular-nums max-sm:hidden">
        {tracks ? formatLength(tracks.reduce((sum, track) => sum + track.duration, 0)) : null}
      </span>
      <span className="text-muted-foreground truncate max-sm:hidden">You</span>
      <span />
    </div>
  );
}

function PlaylistLine({ playlist, depth }: { playlist: PlaylistRow; depth: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const copy = useMutation(
    trpc.playlists.duplicate.mutationOptions({
      onSuccess: async (copyId) => {
        await refresh();
        router.push(`/playlists/${copyId}/edit`);
      },
      onError,
    }),
  );
  const remove = useMutation(trpc.playlists.delete.mutationOptions({ onSuccess: refresh, onError }));
  const [infoOpen, setInfoOpen] = useState(false);
  const togglePin = usePin();

  return (
    <div className={cn(columns, "hover:bg-accent min-h-10 border-b px-4 text-sm transition-colors")}>
      <div className="flex min-w-0 items-center gap-2 py-2" style={indent(depth)}>
        {/* Sits under a folder's icon, past its chevron. */}
        <ListMusic className="text-muted-foreground ml-6 size-4 shrink-0" />
        <Link href={`/playlists/${playlist.id}`} className="truncate outline-none hover:underline focus-visible:underline">
          {playlist.name}
        </Link>
        {playlist.pinnedAt ? <Pin className="text-brand size-3.5 shrink-0 fill-current" aria-label="Pinned" /> : null}
        {playlist.readOnly ? <Badge variant="outline">From disk</Badge> : null}
        {playlist.isPublic && !playlist.readOnly ? <Badge variant="outline">Public</Badge> : null}
      </div>
      <span className="text-muted-foreground text-right tabular-nums">{playlist.trackCount}</span>
      <span className="text-muted-foreground text-right tabular-nums max-sm:hidden">{formatLength(playlist.duration)}</span>
      <span className="text-muted-foreground truncate max-sm:hidden">{playlist.isMine ? "You" : playlist.ownerName}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More for ${playlist.name}`} className="text-muted-foreground">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {playlist.canEdit ? (
            <DropdownMenuItem asChild>
              <Link href={`/playlists/${playlist.id}/edit`}>Edit</Link>
            </DropdownMenuItem>
          ) : null}
          {/* The way to get an editable version of a playlist that follows the disk, or of someone else's. */}
          <DropdownMenuItem disabled={copy.isPending} onSelect={() => copy.mutate({ id: playlist.id })}>
            Make a copy
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => togglePin(playlist)}>{playlist.pinnedAt ? "Unpin" : "Pin to the top"}</DropdownMenuItem>
          {playlist.canSetCover && !playlist.canEdit ? (
            <DropdownMenuItem asChild>
              <Link href={`/playlists/${playlist.id}/edit`}>Change cover</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setInfoOpen(true)}>Get info</DropdownMenuItem>
          {playlist.canEdit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  const ok = await confirm({
                    title: `Delete ${playlist.name}?`,
                    description: "The playlist goes. The tracks stay in the library.",
                    confirmLabel: "Delete",
                    variant: "destructive",
                  });
                  if (ok) remove.mutate({ id: playlist.id }, { onSuccess: () => toast(`Deleted ${playlist.name}`) });
                }}
              >
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Draws nothing in the row; the dialog opens over the page. */}
      <PlaylistInfoDialog playlist={playlist} open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}
