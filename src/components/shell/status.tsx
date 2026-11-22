import { cn } from "~/lib/utils";

export type Tone = "ok" | "warn" | "bad" | "neutral";

const dotTone: Record<Tone, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  neutral: "bg-foreground/30",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", dotTone[tone], className)} />;
}

/** A dot, a word, and the reason in muted type: "Disabled · Left the company". */
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
    <span className={cn("inline-flex items-center gap-2 text-sm whitespace-nowrap", className)}>
      <StatusDot tone={tone} />
      <span>{label}</span>
      {reason ? <span className="text-muted-foreground text-xs">· {reason}</span> : null}
    </span>
  );
}
