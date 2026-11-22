"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { AppPasswordList } from "~/components/shell/app-passwords";
import { PageCrumb } from "~/components/shell/crumb";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useTRPC } from "~/trpc/react";

const head = "t-label text-muted-foreground text-[10px]";
const bitRates = [320, 256, 192, 128, 96];

/** One setting: its name and what it does on the left, its control on the right. */
function Setting({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Everything an admin can change about one person: role, limits, which libraries they reach, their app passwords. */
export function UserView({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const user = useQuery(trpc.admin.users.byId.queryOptions({ id }));
  const [resetting, setResetting] = useState(false);

  const refresh = () => queryClient.invalidateQueries(trpc.admin.users.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.admin.users.update.mutationOptions({ onSuccess: refresh, onError }));
  const setAccess = useMutation(trpc.admin.users.setAccess.mutationOptions({ onSuccess: refresh, onError }));
  const revoke = useMutation(trpc.admin.users.revokeAppPassword.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.admin.users.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        router.push("/admin/users");
      },
      onError,
    }),
  );

  if (user.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError message={user.error.message} />
      </Page>
    );
  }
  const data = user.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <Skeleton className="h-64" />
      </Page>
    );
  }
  const name = data.username ?? data.name;
  const isAdmin = data.role === "admin";

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={name} />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Setting label="Role" detail="Admins manage users and libraries, and reach every library.">
            <Select value={isAdmin ? "admin" : "user"} onValueChange={(role) => update.mutate({ id, role: role as "user" | "admin" })}>
              <SelectTrigger size="sm" aria-label="Role" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Setting>
          <Setting label="Streaming quality" detail="Anything above the limit is converted down before it is sent.">
            <Select
              value={String(data.maxBitRate ?? "none")}
              onValueChange={(value) => update.mutate({ id, maxBitRate: value === "none" ? null : Number(value) })}
            >
              <SelectTrigger size="sm" aria-label="Streaming quality" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="none">Original</SelectItem>
                {bitRates.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate} kbps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Setting>
          <Setting label="Disabled" detail="Signs them out everywhere and stops their apps.">
            <Switch
              aria-label="Disabled"
              checked={data.banned}
              onCheckedChange={(banned) => update.mutate({ id, banned }, { onSuccess: () => toast(banned ? `Disabled ${name}` : `Enabled ${name}`) })}
            />
          </Setting>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Libraries</h2>
        <p className="text-muted-foreground mb-3 text-xs">
          {isAdmin ? "Admins reach every library and can download from all of them." : "Access lets them browse and play. Download adds saving the original files."}
        </p>
        {data.access.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={head}>Library</TableHead>
                <TableHead className={`${head} max-sm:hidden`}>Folder</TableHead>
                <TableHead className={`${head} w-24 text-center`}>Access</TableHead>
                <TableHead className={`${head} w-24 text-center`}>Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.access.map((row) => {
                const granted = isAdmin || row.granted;
                const canDownload = isAdmin || row.canDownload;
                const change = (next: { granted: boolean; canDownload: boolean }) => setAccess.mutate({ userId: id, libraryId: row.libraryId, ...next });
                return (
                  <TableRow key={row.libraryId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs max-sm:hidden">{row.path}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`${row.name}: access`}
                        checked={granted}
                        disabled={isAdmin}
                        onCheckedChange={(checked) => change({ granted: checked === true, canDownload: checked === true && canDownload })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        aria-label={`${row.name}: download`}
                        checked={granted && canDownload}
                        disabled={isAdmin || !granted}
                        onCheckedChange={(checked) => change({ granted: true, canDownload: checked === true })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">No libraries yet. Add one under Libraries.</p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Music apps</CardTitle>
          <CardDescription>App passwords {name} has made. They add their own from Account.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.appPasswords.length ? (
            <AppPasswordList
              rows={data.appPasswords}
              onRevoke={(row) => revoke.mutate({ id: row.id }, { onSuccess: () => toast(`Revoked ${row.name}`) })}
            />
          ) : (
            <p className="text-muted-foreground text-sm">None yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setResetting(true)}>
          Reset password
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const ok = await confirm({
              title: `Delete ${name}?`,
              description: "Their account, playlists and app passwords go. Their plays stay in the logs.",
              confirmLabel: "Delete",
              variant: "destructive",
            });
            if (ok) remove.mutate({ id }, { onSuccess: () => toast(`Deleted ${name}`) });
          }}
        >
          Delete user
        </Button>
      </div>

      {resetting ? <ResetPasswordDialog id={id} name={name} onClose={() => setResetting(false)} /> : null}
    </Page>
  );
}

function ResetPasswordDialog({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const trpc = useTRPC();
  const [password, setPassword] = useState("");
  const reset = useMutation(
    trpc.admin.users.setPassword.mutationOptions({
      onSuccess: () => {
        toast(`Password reset for ${name}`);
        onClose();
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
            reset.mutate({ id, password });
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset password for {name}</DialogTitle>
            <DialogDescription>They are signed out of the website. Their music apps keep working.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input id="reset-password" type="text" autoComplete="off" className="font-mono" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
            <p className={reset.error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{reset.error?.message ?? "At least 12 characters."}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={password.length < 12 || reset.isPending}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
