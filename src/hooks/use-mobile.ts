import * as React from "react";

const MOBILE_BREAKPOINT = 1024;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True below the lg breakpoint, where the sidebar becomes a sheet (as in Atmos). Server render assumes desktop. */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
