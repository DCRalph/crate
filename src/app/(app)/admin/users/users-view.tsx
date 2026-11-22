"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { LocalTime } from "~/components/local-time";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { Status } from "~/components/shell/status";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";

/** Everyone with an account. A row opens that person's page. */
export function UsersView() {
  const trpc = useTRPC();
  const router = useRouter();
  const users = useQuery(trpc.admin.users.list.queryOptions());
  const [adding, setAdding] = useState(false);

  return (
    <Page>
      <SectionHeading title="All users" detail={users.data ? count(users.data.length, "user") : null}>
        <Button variant="brand" size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add user
        </Button>
      </SectionHeading>
      {users.isPending ? (
        <Skeleton className="h-40" />
      ) : users.isError ? (
        <LoadError message={users.error.message} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={head}>User</TableHead>
              <TableHead className={head}>Status</TableHead>
              <TableHead className={`${head} text-right`}>Libraries</TableHead>
              <TableHead className={`${head} text-right max-sm:hidden`}>Apps</TableHead>
              <TableHead className={`${head} max-md:hidden`}>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.map((user) => (
              <TableRow key={user.id} className="cursor-pointer" onClick={() => router.push(`/admin/users/${user.id}`)}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{user.username ?? user.name}</span>
                    {user.name !== user.username ? <span className="text-muted-foreground text-xs">{user.name}</span> : null}
                    {user.role === "admin" ? <Badge variant="secondary">Admin</Badge> : null}
                  </span>
                </TableCell>
                <TableCell>{user.banned ? <Status tone="bad" label="Disabled" /> : <Status tone="ok" label="Active" />}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">{user.role === "admin" ? "All" : user.libraryCount}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums max-sm:hidden">{user.appPasswordCount}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums max-md:hidden">
                  <LocalTime date={user.lastSeenAt} format="relative" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {adding ? <AddUserDialog onClose={() => setAdding(false)} /> : null}
    </Page>
  );
}

function AddUserDialog({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const create = useMutation(
    trpc.admin.users.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.admin.users.pathFilter());
        toast(`Added ${username.trim().toLowerCase()}`);
        // Straight to their page: a new user can't see anything until they're given a library.
        router.push(`/admin/users/${created.id}`);
      },
    }),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ username, password, role });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" autoCapitalize="none" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-user-password">Password</Label>
              <Input id="new-user-password" type="text" autoComplete="off" className="font-mono" value={password} onChange={(event) => setPassword(event.target.value)} />
              <p className="text-muted-foreground text-xs">At least 12 characters. They can change it after signing in.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-user-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger id="new-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {create.error ? <p className="text-destructive text-xs">{create.error.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!username.trim() || password.length < 12 || create.isPending}>
              Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
