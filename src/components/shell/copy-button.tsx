"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "~/components/ui/button";

/** Icon button that copies `value` and ticks for a moment. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-emerald-400" /> : <Copy />}
    </Button>
  );
}
