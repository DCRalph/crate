import { site } from "~/lib/site";
import { serverKey } from "~/server/media/sealed";

/** The version of the native app's connection this server speaks. The app refuses a server it is too old or too new for. */
const protocol = 1;

/**
 * What the native app asks an address before anything else: is this a server
 * of ours, and what is its key. No sign-in, and nothing here is private. The
 * app keeps the key from the day it pairs, and sealed audio is only readable
 * to a device that agreed its key with the server holding this one.
 */
export function GET() {
  return Response.json({ app: site.serverType, name: site.name, version: site.version, protocol, key: serverKey }, { headers: { "Cache-Control": "no-store" } });
}
