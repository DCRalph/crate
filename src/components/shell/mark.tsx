import { site } from "~/lib/site";
import { cn } from "~/lib/utils";

/**
 * The brand tile: a record on brand red, drawn inline so it needs no request.
 * Changing `spin` gives the record one turn, which is how the app shows a
 * track starting. Hovering it scratches the record back and forth.
 */
export function Mark({ className, spin }: { className?: string; spin?: string | number }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={site.name} className={cn("group/mark shrink-0", className)}>
      <rect width="64" height="64" rx="15.36" fill="var(--brand)" />
      {/* Two groups, so the hover scratch ending doesn't restart the spin. */}
      <g key={spin} className={spin === undefined ? undefined : "animate-spin-once"} style={{ transformOrigin: "32px 32px" }}>
        <g className="group-hover/mark:animate-scratch" style={{ transformOrigin: "32px 32px" }}>
          <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="5" />
          {/* The glint is what makes a turn visible. */}
          <path d="M32 21.5a10.5 10.5 0 0 1 10.5 10.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="32" r="4.5" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
