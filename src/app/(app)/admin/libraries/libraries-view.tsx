"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { LocalTime } from "~/components/local-time";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { Status } from "~/components/shell/status";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count } from "~/lib/format";
import type { ScanResult } from "~/server/db/app-schema";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";
const number = new Intl.NumberFormat("en");

/** "Added 12, removed 3 in 4.2s", or "No changes in 0.3s". */
function scanSummary(scan: ScanResult) {
  const parts = [
    scan.added ? `added ${number.format(scan.added)}` : null,
    scan.updated ? `updated ${number.format(scan.updated)}` : null,
    scan.removed ? `removed ${number.format(scan.removed)}` : null,
    scan.failed ? `${number.format(scan.failed)} unreadable` : null,
  ].filter(Boolean);
  const what = parts.length ? parts.join(", ") : "no changes";
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} in ${(scan.durationMs / 1000).toFixed(1)}s`;
}

/** The folders of music on the server. Adding one scans it; a scan's progress shows in its row. */
export function LibrariesView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const libraries = useQuery(
    trpc.admin.libraries.list.queryOptions(undefined, {
      // While a scan runs, the row's count is the progress display.
      refetchInterval: (query) => (query.state.data?.scan ? 1000 : false),
    }),
  );
  const refresh = () => queryClient.invalidateQueries(trpc.admin.libraries.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const scan = useMutation(trpc.admin.libraries.scan.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(trpc.admin.libraries.delete.mutationOptions({ onSuccess: refresh, onError }));
  const running = libraries.data?.scan ?? null;

  return (
    <Page>
      <SectionHeading title="All libraries" detail={libraries.data ? count(libraries.data.libraries.length, "library", "libraries") : null}>
        <Button variant="secondary" size="sm" disabled={!!running || !libraries.data?.libraries.length} onClick={() => scan.mutate({})}>
          <RefreshCw />
          Scan all
        </Button>
        <Button variant="brand" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add library
        </Button>
      </SectionHeading>

      {libraries.isPending ? (
        <Skeleton className="h-40" />
      ) : libraries.isError ? (
        <LoadError message={libraries.error.message} />
      ) : libraries.data.libraries.length === 0 ? (
        <Empty>No libraries yet. Add a folder of music to get started.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>Library</TableHead>
              <TableHead className={`${head} max-lg:hidden`}>Folder</TableHead>
              <TableHead className={`${head} text-right max-sm:hidden`}>Albums</TableHead>
              <TableHead className={`${head} text-right`}>Tracks</TableHead>
              <TableHead className={`${head} text-right max-sm:hidden`}>Users</TableHead>
              <TableHead className={head}>Last scan</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {libraries.data.libraries.map((library) => (
              <TableRow key={library.id}>
                <TableCell className="font-medium">{library.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs max-lg:hidden">{library.path}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums max-sm:hidden">{number.format(library.albumCount)}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">{number.format(library.trackCount)}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums max-sm:hidden">{library.userCount}</TableCell>
                <TableCell>
                  {running?.libraryId === library.id ? (
                    <Status
                      tone="warn"
                      label="Scanning"
                      reason={<span className="tabular-nums">{`${number.format(running.done)} of ${number.format(running.total)}`}</span>}
                    />
                  ) : library.lastScan?.error ? (
                    <Status tone="bad" label="Failed" reason={library.lastScan.error} className="whitespace-normal" />
                  ) : library.lastScan && library.lastScanAt ? (
                    <Status
                      tone={library.lastScan.failed ? "warn" : "ok"}
                      label={<LocalTime date={library.lastScanAt} format="relative" />}
                      reason={<span className="tabular-nums">{scanSummary(library.lastScan)}</span>}
                    />
                  ) : (
                    <Status tone="neutral" label="Not scanned" />
                  )}
                </TableCell>
                <TableCell className="py-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More for ${library.name}`} className="text-muted-foreground">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={!!running} onSelect={() => scan.mutate({ id: library.id })}>
                        Scan now
                      </DropdownMenuItem>
                      {/* A normal scan skips files that haven't changed; this reads all of them again. */}
                      <DropdownMenuItem disabled={!!running} onSelect={() => scan.mutate({ id: library.id, full: true })}>
                        Rescan every file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!!running}
                        onSelect={async () => {
                          const ok = await confirm({
                            title: `Remove ${library.name}?`,
                            description: "Its albums and tracks go from the server and from any playlists. The files on disk are not touched.",
                            confirmLabel: "Remove",
                            variant: "destructive",
                          });
                          if (ok) remove.mutate({ id: library.id }, { onSuccess: () => toast(`Removed ${library.name}`) });
                        }}
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {adding ? <AddLibraryDialog onClose={() => setAdding(false)} onAdded={refresh} /> : null}
    </Page>
  );
}

function AddLibraryDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const create = useMutation(
    trpc.admin.libraries.create.mutationOptions({
      onSuccess: () => {
        onAdded();
        toast(`Added ${name.trim()}. Scanning now.`);
        onClose();
      },
    }),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ name, path });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add library</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="library-name">Name</Label>
              <Input id="library-name" placeholder="Main" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={60} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="library-path">Folder</Label>
              <Input id="library-path" placeholder="/music/library" className="font-mono" autoCapitalize="none" spellCheck={false} value={path} onChange={(event) => setPath(event.target.value)} />
              <p className={create.error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
                {create.error?.message ?? "A path on the server. Nobody but admins can reach it until you give them access."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !path.trim() || create.isPending}>
              Add and scan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
