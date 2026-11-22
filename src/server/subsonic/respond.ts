import { site } from "~/lib/site";

/** A Subsonic API error, sent to the client inside an ordinary response. */
export class SubsonicError extends Error {
  constructor(
    public code: keyof typeof errorCodes,
    message?: string,
    public httpStatus = 200,
  ) {
    super(message ?? errorCodes[code]);
  }
}

export const errorCodes = {
  0: "Something went wrong.",
  10: "Required parameter is missing.",
  40: "Wrong username or password.",
  41: "Token authentication is not supported for this user.",
  42: "This way of signing in is not supported.",
  43: "Send either an API key or a username, not both.",
  44: "Invalid API key.",
  50: "You are not allowed to do that.",
  70: "Not found.",
} as const;

export type Payload = Record<string, unknown>;

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);

/**
 * Subsonic's XML is its JSON with a fixed mapping: scalars become attributes,
 * objects become child elements, arrays repeat the element, and a `value` key
 * is the element's text.
 */
export function toXml(name: string, node: Payload): string {
  let attributes = "";
  let children = "";
  for (const [key, value] of Object.entries(node)) {
    if (value === null || value === undefined) continue;
    if (key === "value") children += escapeXml(String(value));
    else if (Array.isArray(value)) {
      for (const item of value) {
        children += typeof item === "object" && item !== null ? toXml(key, item as Payload) : `<${key}>${escapeXml(String(item))}</${key}>`;
      }
    } else if (typeof value === "object") children += toXml(key, value as Payload);
    else attributes += ` ${key}="${escapeXml(String(value))}"`;
  }
  return children ? `<${name}${attributes}>${children}</${name}>` : `<${name}${attributes}/>`;
}

/** Drops null and undefined fields: in Subsonic's JSON an absent value is a missing key, never null. */
const withoutNulls = (key: string, value: unknown) => (value === null ? undefined : value);

/** Wraps a payload (or an error) in the response envelope, in the format the client asked for. */
export function subsonicResponse(params: URLSearchParams, result: Payload | SubsonicError): Response {
  const failed = result instanceof SubsonicError;
  const body = {
    status: failed ? "failed" : "ok",
    version: "1.16.1",
    type: site.serverType,
    serverVersion: site.version,
    openSubsonic: true,
    ...(failed ? { error: { code: result.code, message: result.message } } : result),
  };
  const status = failed ? result.httpStatus : 200;
  const format = params.get("f") ?? "xml";

  if (format === "json") return new Response(JSON.stringify({ "subsonic-response": body }, withoutNulls), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  if (format === "jsonp") {
    // The callback goes into a script, so it may only be a plain identifier.
    const callback = params.get("callback")?.replace(/[^\w$.]/g, "") || "callback";
    return new Response(`${callback}(${JSON.stringify({ "subsonic-response": body }, withoutNulls)});`, {
      status,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>${toXml("subsonic-response", { xmlns: "http://subsonic.org/restapi", ...body })}`;
  return new Response(xml, { status, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
