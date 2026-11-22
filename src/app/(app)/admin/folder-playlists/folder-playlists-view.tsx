"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { Page } from "~/components/shell/page";
import { Empty, LoadError, SectionHeading } from "~/components/shell/states";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";

const modes = {
  subfolders: { label: "A playlist per subfolder", detail: "Each folder directly inside becomes a playlist, with everything under it." },
  leaves: { label: "A playlist per folder with tracks", detail: "Every folder that holds tracks, at any depth, named like \"2024 / Summer\"." },
  folder: { label: "One playlist", detail: "The whole folder, with everything under it, as a single playlist." },
} as const;
const syncs = {
  mirror: { label: "Mirror", detail: "Follows the folder on every scan. Read-only." },
  seed: { label: "Import once", detail: "Made once, then an ordinary playlist you can edit." },
} as const;
type Mode = keyof typeof modes;
type Sync = keyof typeof syncs;

/** Rules that turn folders into playlists. They run after every scan. */
export function FolderPlaylistsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const rules = useQuery(trpc.admin.folderRules.list.queryOptions());
  const [adding, setAdding] = useState(false);
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries(trpc.admin.folderRules.pathFilter()), queryClient.invalidateQueries(trpc.playlists.pathFilter())]);
  const remove = useMutation(trpc.admin.folderRules.delete.mutationOptions({ onSuccess: refresh, onError: (error) => toast.error(error.message) }));

  return (
    <Page maxWidth="max-w-5xl">
      <SectionHeading title="Rules" detail={rules.data ? count(rules.data.length, "rule") : null}>
        <Button variant="brand" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add rule
        </Button>
      </SectionHeading>
      {rules.isPending ? (
        <Skeleton className="h-32" />
      ) : rules.isError ? (
        <LoadError message={rules.error.message} />
      ) : rules.data.length === 0 ? (
        <Empty>No rules yet. A rule turns a folder into playlists and keeps them up to date after every scan.</Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>Folder</TableHead>
              <TableHead className={`${head} max-md:hidden`}>Makes</TableHead>
              <TableHead className={head}>Sync</TableHead>
              <TableHead className={`${head} text-right`}>Playlists</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.data.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <span className="font-medium">{rule.libraryName}</span>
                  <span className="text-muted-foreground font-mono text-xs"> /{rule.path}</span>
                </TableCell>
                <TableCell className="text-muted-foreground max-md:hidden">{modes[rule.mode].label}</TableCell>
                <TableCell>
                  <Badge variant="outline">{syncs[rule.sync].label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">{rule.playlistCount}</TableCell>
                <TableCell className="py-0 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Remove this rule?",
                        description:
                          rule.sync === "mirror"
                            ? `Its ${count(rule.playlistCount, "mirrored playlist")} will be deleted too.`
                            : "The playlists it made are kept.",
                        confirmLabel: "Remove",
                        variant: "destructive",
                      });
                      if (ok) remove.mutate({ id: rule.id }, { onSuccess: () => toast("Rule removed") });
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {adding ? <AddRuleDialog onClose={() => setAdding(false)} onAdded={refresh} /> : null}
    </Page>
  );
}

function AddRuleDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const trpc = useTRPC();
  const libraries = useQuery(trpc.admin.libraries.list.queryOptions());
  const [libraryId, setLibraryId] = useState<string>("");
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<Mode>("subfolders");
  const [sync, setSync] = useState<Sync>("mirror");
  const [isPublic, setIsPublic] = useState(true);
  const create = useMutation(
    trpc.admin.folderRules.create.mutationOptions({
      onSuccess: () => {
        onAdded();
        toast("Rule added. Playlists built.");
        onClose();
      },
    }),
  );
  const library = libraries.data?.libraries.find((item) => String(item.id) === libraryId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ libraryId: Number(libraryId), path, mode, sync, isPublic });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add rule</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-library">Library</Label>
              <Select value={libraryId} onValueChange={setLibraryId}>
                <SelectTrigger id="rule-library" className="w-full">
                  <SelectValue placeholder="Choose a library" />
                </SelectTrigger>
                <SelectContent>
                  {libraries.data?.libraries.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-path">Folder inside the library</Label>
              <Input id="rule-path" placeholder="Leave empty for the whole library" className="font-mono" autoCapitalize="none" spellCheck={false} value={path} onChange={(event) => setPath(event.target.value)} />
              {library ? (
                <p className="text-muted-foreground font-mono text-xs break-all">
                  {library.path}/{path.replace(/^\/+/, "")}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-mode">Make</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                <SelectTrigger id="rule-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modes).map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{modes[mode].detail}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-sync">Keep in sync</Label>
              <Select value={sync} onValueChange={(value) => setSync(value as Sync)}>
                <SelectTrigger id="rule-sync" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(syncs).map(([value, item]) => (
                    <SelectItem key={value} value={value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{syncs[sync].detail}</p>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="font-medium">Public</span>
                <span className="text-muted-foreground block text-xs">Shown to everyone who can reach the library. Off keeps them to you.</span>
              </span>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </label>
            {create.error ? <p className="text-destructive text-xs">{create.error.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!libraryId || create.isPending}>
              Add rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
