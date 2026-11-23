"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, ListMusic } from "lucide-react";

import { AudienceSetting } from "~/components/playlists/audience-picker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { describeAudience, type Audience, type AudienceTarget } from "~/lib/audience";
import { buildTree, type Tree } from "~/lib/tree";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Made = RouterOutputs["admin"]["folderRules"]["made"];
type MadeTree = Tree<Made["folders"][number], Made["playlists"][number]>;
type Describe = (audience: Audience) => string;
type Edit = (target: AudienceTarget, name: string) => void;

/** One thing the rule made: its name, whether it has a setting of its own, who can listen now, and the way to change that. */
function MadeRow({ item, type, depth, describe, onEdit }: { item: Made["folders"][number] | Made["playlists"][number]; type: AudienceTarget["type"]; depth: number; describe: Describe; onEdit: Edit }) {
  const Icon = type === "folder" ? Folder : ListMusic;
  return (
    <div className="flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0" style={{ paddingLeft: `${depth * 1.25}rem` }}>
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {item.own ? <Badge variant="outline">Own</Badge> : null}
      <span className="text-muted-foreground min-w-0 truncate text-xs max-sm:hidden">{describe(item.audience)}</span>
      <Button variant="ghost" size="sm" aria-label={`Change who can listen to ${item.name}`} onClick={() => onEdit({ type, id: item.id }, item.name)}>
        Change
      </Button>
    </div>
  );
}

function MadeLevel({ level, depth, describe, onEdit }: { level: MadeTree; depth: number; describe: Describe; onEdit: Edit }) {
  return (
    <>
      {level.folders.map((node) => (
        <div key={`f${node.folder.id}`}>
          <MadeRow item={node.folder} type="folder" depth={depth} describe={describe} onEdit={onEdit} />
          <MadeLevel level={node} depth={depth + 1} describe={describe} onEdit={onEdit} />
        </div>
      ))}
      {level.items.map((item) => (
        <MadeRow key={`p${item.id}`} item={item} type="playlist" depth={depth} describe={describe} onEdit={onEdit} />
      ))}
    </>
  );
}

/**
 * Everything a folder rule has made, as the tree it forms, each with who can
 * listen now and a way to give it a setting of its own. "Own" marks the ones
 * that have one; the rest follow the folder above them, or the rule.
 * `ownerName` is the rule's owner, when that isn't the person looking.
 */
export function RuleAudiences({ ruleId, ownerName }: { ruleId: number; ownerName?: string }) {
  const trpc = useTRPC();
  const made = useQuery(trpc.admin.folderRules.made.queryOptions({ id: ruleId }));
  const people = useQuery(trpc.playlists.people.queryOptions());
  const [editing, setEditing] = useState<{ target: AudienceTarget; name: string } | null>(null);
  const tree = useMemo(
    () =>
      buildTree(made.data?.folders ?? [], made.data?.playlists ?? [], {
        of: (folder) => folder.id,
        parent: (folder) => folder.parentId,
        place: (item) => item.folderId,
      }),
    [made.data],
  );
  const names = useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person.name])), [people.data]);
  const describe: Describe = (audience) => describeAudience(audience, { ownerName, people: names });

  if (made.isPending) return <Skeleton className="h-32" />;
  if (made.isError) return <p className="text-destructive text-sm">{made.error.message}</p>;
  if (!made.data.folders.length && !made.data.playlists.length) return <p className="text-muted-foreground text-sm">It hasn&apos;t made anything yet.</p>;

  return (
    <>
      <div aria-label="What the rule made" className="max-h-96 overflow-y-auto rounded-md border px-3 py-1">
        <MadeLevel level={tree} depth={0} describe={describe} onEdit={(target, name) => setEditing({ target, name })} />
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
          </DialogHeader>
          {editing ? <AudienceSetting target={editing.target} idPrefix="rule-item" /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
