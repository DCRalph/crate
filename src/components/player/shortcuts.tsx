"use client";

import { create } from "zustand";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";

/** Whether the list of keyboard shortcuts is showing. Opened with "?" or from the menu under a person's initial. */
export const useShortcutsHelp = create<{ open: boolean }>()(() => ({ open: false }));

/** Every key the deck listens for, in the order they are listed. `useDeckKeys` is where they are acted on. */
export const shortcuts: { keys: string[]; does: string }[] = [
  { keys: ["Space"], does: "Play or pause" },
  { keys: ["←", "→"], does: "Back or on five seconds" },
  { keys: ["N"], does: "Next track" },
  { keys: ["P"], does: "Previous track, or the start of this one" },
  { keys: ["S"], does: "Shuffle" },
  { keys: ["R"], does: "Repeat" },
  { keys: ["M"], does: "Mute" },
  { keys: ["−", "+"], does: "Volume down or up" },
  { keys: ["L"], does: "Like the track that is playing" },
  { keys: ["Q"], does: "Open or close the queue" },
  { keys: ["0–9", "Enter"], does: "Play the row with that number" },
  { keys: ["Alt", "↑↓"], does: "Move a queued track, with the keyboard on it" },
  { keys: ["/"], does: "Search" },
  { keys: ["?"], does: "This list" },
];

/** The list of keyboard shortcuts. */
export function ShortcutsDialog() {
  const open = useShortcutsHelp((state) => state.open);
  return (
    <Dialog open={open} onOpenChange={(next) => useShortcutsHelp.setState({ open: next })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="px-6 sm:pl-0">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work anywhere but in a text field.</DialogDescription>
        </DialogHeader>
        <dl className="text-sm">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.does} className="flex items-center justify-between gap-4 border-b py-1.5 last:border-b-0">
              <dt>{shortcut.does}</dt>
              <dd className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="text-muted-foreground min-w-6 rounded-sm border px-1.5 py-0.5 text-center font-sans text-[11px]">
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
