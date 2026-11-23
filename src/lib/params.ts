import { notFound } from "next/navigation";

/** A record's id from the address. Anything that isn't a whole number is an address that leads nowhere. */
export function idParam(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) notFound();
  return id;
}
