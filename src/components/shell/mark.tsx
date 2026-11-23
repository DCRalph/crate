import { site } from "~/lib/site";
import { cn } from "~/lib/utils";

/**
 * The wordmark, lettered on an ivory plate like a maker's badge screwed to
 * the cabinet, with a lamp beside the name that is lit while something is
 * playing.
 */
export function Mark({ className, lit = false }: { className?: string; lit?: boolean }) {
  return (
    <span className={cn("print t-display inline-flex h-[26px] items-center gap-2 rounded-[3px] px-2 text-[19px] shadow-[inset_0_1px_0_#fff,0_1px_0_rgb(0_0_0/0.35)]", className)}>
      {site.name}
      <span className="lamp" data-lit={lit} aria-hidden />
    </span>
  );
}
