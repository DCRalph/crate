"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";

/** Username and password. `next` is where to go afterwards, already checked to be on this site. */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const result = await authClient.signIn.username({ username: username.trim(), password });
        if (result.error) {
          setPending(false);
          setError(
            result.error.status === 429
              ? "Too many tries. Wait a minute, then try again."
              : (result.error.message ?? "Couldn't sign in."),
          );
          return;
        }
        router.push(next);
        router.refresh();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={!!error}
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
      <Button type="submit" variant="brand" disabled={pending}>
        Sign in
      </Button>
    </form>
  );
}
