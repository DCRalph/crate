import { CopyButton } from "~/components/shell/copy-button";

/** A value to copy into a music app, shown monospace with a copy button. Long values wrap, so nothing is ever cut off. */
export function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground w-20 shrink-0 text-xs">{label}</span>
      <code className="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}
