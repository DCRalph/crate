"use client";

import { useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { openerOf } from "~/lib/focus";

/**
 * The frame both Get info dialogs share: the thing's name as the title, an
 * optional line under it, and its facts as children. The children are only
 * mounted while it is open, so a query inside them waits until someone asks.
 * Closing it gives the keyboard back to the control that opened it.
 */
export function InfoDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  // What had the keyboard as the dialog opened, noted during that render: by the time an effect runs, focus has
  // already moved into the dialog. It is opened from menus, so this is the menu's button.
  const [wasOpen, setWasOpen] = useState(open);
  // It can also be mounted already open, in which case the note is taken as it mounts.
  const [opener, setOpener] = useState(() => (open ? openerOf(document.activeElement) : null));
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(openerOf(document.activeElement));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* With no line under the title, the dialog is told it has no description rather than left pointing at one. */}
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus();
        }}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        {/* Room for the close button beside a long title. */}
        <DialogHeader className="px-6 sm:pl-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** A list of facts, one to a ruled line. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="text-sm">{children}</dl>;
}

/** One fact: its name on the left, its value on the right. Draws nothing when there is no value to show. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b py-1.5 last:border-b-0">
      <dt className="t-label text-muted-foreground text-[11px] leading-5">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums">{children}</dd>
    </div>
  );
}

/** Static lines in the shape of the facts, while they load. */
export function FactsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

const sizeUnits = ["B", "KB", "MB", "GB", "TB"];

/** A file size: "812 KB", "34.2 MB", "1.2 GB". */
export function formatSize(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < sizeUnits.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit < 2 || value >= 100 ? 0 : 1)} ${sizeUnits[unit]}`;
}
