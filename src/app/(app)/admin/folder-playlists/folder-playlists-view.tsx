"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { ruleModes } from "~/components/admin/folder-rule-parts";
import { DataTable, useDataTable, type DataTableColumn } from "~/components/data-table";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count } from "~/lib/format";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Rule = RouterOutputs["admin"]["folderRules"]["list"][number];

const columns: DataTableColumn<Rule>[] = [
  {
    id: "folder",
    header: "Folder",
    hideable: false,
    cell: (rule) => (
      <span className="font-mono text-xs">
        <span className="text-muted-foreground">{rule.libraryName}/</span>
        {rule.path || <span className="text-muted-foreground font-sans">whole library</span>}
      </span>
    ),
  },
  { id: "mode", header: "Makes", cell: (rule) => ruleModes[rule.mode].label },
  { id: "playlistCount", header: "Playlists", type: "number", align: "right" },
  { id: "folderCount", header: "Folders", type: "number", align: "right", showFrom: 620 },
  { id: "isPublic", header: "Seen by", showFrom: 700, cell: (rule) => <span className="text-muted-foreground">{rule.isPublic ? "Everyone" : "Only the owner"}</span> },
  { id: "ownerName", header: "Owner", showFrom: 820, cell: (rule) => <span className="text-muted-foreground">{rule.ownerName}</span> },
];

/** Rules that keep playlists and playlist folders in step with folders on disk. A row opens the rule's own page. */
export function FolderPlaylistsView() {
  const trpc = useTRPC();
  const router = useRouter();
  const rules = useQuery(trpc.admin.folderRules.list.queryOptions());
  const table = useDataTable({ columns, getRowId: (rule) => String(rule.id), storageKey: "folder-rules" });

  return (
    <Page>
      <SectionHeading title="Folder playlists" detail={rules.data ? count(rules.data.length, "rule") : null}>
        <Button variant="brand" size="sm" asChild>
          <Link href="/admin/folder-playlists/new">
            <Plus />
            Add rule
          </Link>
        </Button>
      </SectionHeading>
      <p className="text-muted-foreground mb-4 max-w-prose text-sm">
        A rule follows one folder in a library. After every scan, the playlists and folders it makes are brought back in line with the files.
      </p>
      {rules.isError ? (
        <LoadError message={rules.error.message} />
      ) : (
        <DataTable
          api={table}
          columns={columns}
          data={rules.data ?? []}
          total={rules.data?.length ?? 0}
          isLoading={rules.isPending}
          enableToolbar={false}
          enablePagination={false}
          onRowClick={(rule) => router.push(`/admin/folder-playlists/${rule.id}`)}
          emptyMessage="No rules yet. Add one to turn a folder of mixes into playlists."
        />
      )}
    </Page>
  );
}
