"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { AppPasswordList } from "~/components/shell/app-passwords";
import { CopyButton } from "~/components/shell/copy-button";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import { useTRPC } from "~/trpc/react";

/** The user's own password, and the app passwords their music apps sign in with. */
export function AccountView() {
  return (
    <Page maxWidth="max-w-2xl" className="flex flex-col gap-6">
      <AppsCard />
      <PasswordCard />
    </Page>
  );
}

/** A value to copy into a music app, shown monospace with a copy button. */
function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function AppsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const connection = useQuery(trpc.account.connection.queryOptions());
  const passwords = useQuery(trpc.account.appPasswords.queryOptions());
  const [adding, setAdding] = useState(false);
  const refresh = () => queryClient.invalidateQueries(trpc.account.appPasswords.pathFilter());
  const revoke = useMutation(
    trpc.account.revokeAppPassword.mutationOptions({ onSuccess: refresh, onError: (error) => toast.error(error.message) }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Music apps</CardTitle>
        <CardDescription>
          Any Subsonic app can play from this server. Each app signs in with its own password, so you can cut one off without touching the others.
        </CardDescription>
        <CardAction>
          <Button variant="brand" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add app
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {connection.data ? (
          <div>
            <CopyField label="Server" value={connection.data.serverUrl} />
            <CopyField label="Username" value={connection.data.username} />
          </div>
        ) : null}
        {passwords.data?.length ? (
          <AppPasswordList
            rows={passwords.data}
            onRevoke={(row) => revoke.mutate({ id: row.id }, { onSuccess: () => toast(`Revoked ${row.name}`) })}
          />
        ) : passwords.data ? (
          <p className="text-muted-foreground text-sm">No app passwords yet.</p>
        ) : null}
      </CardContent>
      {adding ? <AddAppDialog onClose={() => setAdding(false)} onCreated={refresh} /> : null}
    </Card>
  );
}

/** Two steps in one dialog: name the app, then see its password, once. */
function AddAppDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  const create = useMutation(trpc.account.createAppPassword.mutationOptions({ onSuccess: onCreated }));
  const secret = create.data?.secret;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Password for {name.trim()}</DialogTitle>
              <DialogDescription>Enter this as the password in the app. It won&apos;t be shown again.</DialogDescription>
            </DialogHeader>
            <div className="bg-secondary flex items-center justify-between gap-2 rounded-md py-1 pr-1 pl-3">
              <code className="font-mono text-sm break-all">{secret}</code>
              <CopyButton value={secret} label="Copy password" />
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ name });
            }}
          >
            <DialogHeader>
              <DialogTitle>Add app</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="app-name">App or device</Label>
              <Input id="app-name" placeholder="Phone" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={60} />
              {create.error ? <p className="text-destructive text-xs">{create.error.message}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                Create password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>For signing in to this website. Changing it signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:max-w-xs"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            const result = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
            setPending(false);
            if (result.error) return setError(result.error.message ?? "Couldn't change the password.");
            setCurrent("");
            setNext("");
            toast("Password changed");
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(event) => setNext(event.target.value)} aria-invalid={!!error} />
            <p className={error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{error ?? "At least 12 characters."}</p>
          </div>
          <Button type="submit" className="w-fit" disabled={pending || !current || next.length < 12}>
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
