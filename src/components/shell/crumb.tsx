"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { site } from "~/lib/site";

// The header's breadcrumb comes from the navigation, except its last step on a
// record page (a person's name, an app's name), which the page announces here.
const LeafContext = createContext<string | null>(null);
const SetLeafContext = createContext<(leaf: string | null) => void>(() => {});

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState<string | null>(null);
  return (
    <SetLeafContext.Provider value={setLeaf}>
      <LeafContext.Provider value={leaf}>{children}</LeafContext.Provider>
    </SetLeafContext.Provider>
  );
}

/** Rendered by a record page to put its name at the end of the header breadcrumb, and in the browser tab. */
export function PageCrumb({ label }: { label: string }) {
  const setLeaf = useContext(SetLeafContext);
  useEffect(() => {
    setLeaf(label);
    // The page's static title ("Album") is all the server knows; the name arrives with the data.
    const before = document.title;
    document.title = `${label} | ${site.name}`;
    return () => {
      setLeaf(null);
      document.title = before;
    };
  }, [setLeaf, label]);
  return null;
}

export function useCrumbLeaf() {
  return useContext(LeafContext);
}
