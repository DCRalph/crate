"use client";

import { useSyncExternalStore } from "react";

import { formatDate, formatDateTime, timeAgo } from "~/lib/format";

const subscribe = () => () => {};

/**
 * A timestamp in the viewer's own timezone. The server can't know that zone,
 * so the server render and hydration show the plain date and the browser then
 * fills in the local format; hovering shows the full time.
 */
export function LocalTime({
  date,
  format = "datetime",
  className,
}: {
  date: Date | null | undefined;
  format?: "datetime" | "date" | "relative";
  className?: string;
}) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  if (!date) return <span className={className}>Never</span>;
  if (!inBrowser) return <span className={className}>{date.toISOString().slice(0, 10)}</span>;
  const text = format === "relative" ? timeAgo(date) : format === "date" ? formatDate(date) : formatDateTime(date);
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={className}>
      {text}
    </time>
  );
}
