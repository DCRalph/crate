import { expect, test } from "bun:test";

import { SubsonicError, subsonicResponse, toXml } from "./respond";

test("scalars become attributes, objects children, arrays repeat the element", () => {
  const xml = toXml("album", { id: "al-1", songCount: 2, song: [{ id: "tr-1" }, { id: "tr-2" }], artist: { name: "X" } });
  expect(xml).toBe('<album id="al-1" songCount="2"><song id="tr-1"/><song id="tr-2"/><artist name="X"/></album>');
});

test("`value` is the element's text, and text is escaped", () => {
  expect(toXml("genre", { value: "R&B <live>", songCount: 1 })).toBe('<genre songCount="1">R&amp;B &lt;live&gt;</genre>');
  expect(toXml("song", { title: 'Say "Hi"' })).toBe('<song title="Say &quot;Hi&quot;"/>');
});

test("absent values are left out of both formats", async () => {
  expect(toXml("song", { id: "tr-1", year: null, genre: undefined })).toBe('<song id="tr-1"/>');
  const json = await subsonicResponse(new URLSearchParams("f=json"), { song: { id: "tr-1", year: null } }).json();
  expect(json["subsonic-response"].song).toEqual({ id: "tr-1" });
});

test("errors keep HTTP 200 unless given a status, and say failed", async () => {
  const response = subsonicResponse(new URLSearchParams("f=json"), new SubsonicError(70, "Album not found."));
  expect(response.status).toBe(200);
  expect((await response.json())["subsonic-response"]).toMatchObject({ status: "failed", error: { code: 70, message: "Album not found." } });
});

test("a jsonp callback can't carry script", async () => {
  const body = await subsonicResponse(new URLSearchParams("f=jsonp&callback=x);alert(1"), {}).text();
  expect(body.startsWith("xalert1(")).toBe(true);
});
