import { cn } from "~/lib/utils";

export type Tone = "ok" | "warn" | "bad" | "neutral";

/**
 * A status mark. On is a lit lamp and off is a hollow ring, so the two never
 * rest on colour alone. Something under way is a coral dot; something wrong is red.
 */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "ok" || tone === "neutral") return <span aria-hidden data-lit={tone === "ok"} className={cn("lamp", className)} />;
  return <span aria-hidden className={cn("inline-block size-[9px] shrink-0 rounded-full", tone === "warn" ? "bg-brand" : "bg-destructive", className)} />;
}

/** A mark, a word, and the reason in muted type: "Disabled · Left the company". */
export function Status({
  tone,
  label,
  reason,
  className,
}: {
  tone: Tone;
  label: React.ReactNode;
  reason?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm whitespace-nowrap", tone === "bad" && "text-destructive", className)}>
      <StatusDot tone={tone} />
      <span>{label}</span>
      {reason ? <span className="text-muted-foreground text-xs">· {reason}</span> : null}
    </span>
  );
}
