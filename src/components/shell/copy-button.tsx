"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";

/**
 * Puts text on the clipboard. Browsers only offer the clipboard to pages on
 * https or localhost, and this server is often opened by its plain address on
 * the home network, so there is an older way to fall back on.
 */
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.readOnly = true;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

/** Icon button that copies `value` and ticks for a moment. Says so when the browser won't let it. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={async () => {
        if (!(await copyText(value))) return void toast.error("Couldn't copy. Select it and copy by hand.");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-ok" /> : <Copy />}
    </Button>
  );
}
