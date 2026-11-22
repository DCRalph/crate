"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { authClient } from "~/lib/auth-client";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

/** The signed-in person's own name and password. Their music apps and playback have pages of their own. */
export function AccountView() {
  const trpc = useTRPC();
  const profile = useQuery(trpc.account.profile.queryOptions());

  return (
    <Page maxWidth="max-w-2xl" className="flex flex-col gap-6">
      {profile.isError ? (
        <LoadError message={profile.error.message} />
      ) : profile.data ? (
        // Keyed by what is saved, so the field starts from it again after each save.
        <ProfileForm key={profile.data.name} profile={profile.data} />
      ) : (
        <Skeleton className="h-44" />
      )}
      <PasswordForm />
    </Page>
  );
}

/** The name the app shows for them. The username is what they sign in with, and only an admin sets it. */
function ProfileForm({ profile }: { profile: RouterOutputs["account"]["profile"] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile.name);
  const save = useMutation(
    trpc.account.updateName.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.account.profile.pathFilter());
        // The header takes the name from the server, so it is asked again.
        router.refresh();
        toast("Name saved");
      },
    }),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ name });
      }}
    >
      <FormSection
        title="Profile"
        description={
          <>
            You sign in as <span className="text-foreground font-mono">{profile.username}</span>.
          </>
        }
      >
        <Field label="Display name" htmlFor="account-name" error={save.error?.message} hint="Shown in the app in place of your username.">
          <div className="flex gap-2 sm:max-w-sm">
            <Input id="account-name" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            <Button type="submit" variant="secondary" disabled={!name.trim() || name.trim() === profile.name || save.isPending}>
              Save
            </Button>
          </div>
        </Field>
      </FormSection>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
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
      <FormSection title="Password" description="For signing in to this website. Changing it signs you out everywhere else." className="grid gap-4">
        <div className="grid gap-4 sm:max-w-xs">
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="new-password" error={error} hint="At least 12 characters.">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-invalid={!!error}
            />
          </Field>
        </div>
        <FormActions>
          <Button type="submit" disabled={pending || !current || next.length < 12}>
            Change password
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
