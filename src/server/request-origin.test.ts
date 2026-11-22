import { expect, mock, test } from "bun:test";

// The module is server-only; the marker package throws outside a server bundle.
void mock.module("server-only", () => ({}));
const { overHttps, requestOrigin } = await import("./request-origin");

const headers = (init: Record<string, string>) => new Headers(init);
const site = "https://music.example.com";

test("plain http on the LAN is not https, and is shown as it was reached", () => {
  const lan = headers({ host: "192.168.1.20:3000", "x-forwarded-proto": "http" });
  expect(overHttps(lan, site)).toBe(false);
  expect(requestOrigin(lan, site)).toBe("http://192.168.1.20:3000");
});

test("a proxy that terminates TLS says so", () => {
  const proxied = headers({ host: "10.0.0.5:3000", "x-forwarded-host": "music.example.com", "x-forwarded-proto": "https" });
  expect(overHttps(proxied, site)).toBe(true);
  expect(requestOrigin(proxied, site)).toBe(site);
});

test("the public host is https even when the proxy forgets to say", () => {
  expect(overHttps(headers({ host: "music.example.com", "x-forwarded-proto": "http" }), site)).toBe(true);
  // ...but only when the public address itself is https.
  expect(overHttps(headers({ host: "localhost:3000" }), "http://localhost:3000")).toBe(false);
});

test("a proxy that passes on neither host nor scheme still gets Secure cookies for the public site", () => {
  // nginx without proxy_set_header: the app sees its own upstream address.
  const bare = headers({ host: "localhost:3000", origin: site });
  expect(overHttps(bare, site)).toBe(true);
  expect(overHttps(headers({ host: "localhost:3000", origin: "http://192.168.1.20:3000" }), site)).toBe(false);
});

test("with no host to go on, the public address is used", () => {
  expect(requestOrigin(headers({}), site)).toBe(site);
});
