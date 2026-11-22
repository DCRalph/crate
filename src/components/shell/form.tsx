import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

// The parts every editing page is built from, so they all read the same way
// and can be restyled in one place.

/** One titled block of a page: what it is, a line on what it does, and its controls. `action` sits top right. */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={className}>{children}</CardContent>
    </Card>
  );
}

/** A labelled control with one line under it: the error when there is one, otherwise the hint. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error || hint ? <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? hint}</p> : null}
    </div>
  );
}

/** One setting on a line: its name and what it does on the left, its control on the right. Applies as soon as it is changed. */
export function SettingRow({ label, detail, children }: { label: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail ? <p className="text-muted-foreground text-xs">{detail}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** The buttons under a form: the main action first, then the way out. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
