import { expect, test } from "bun:test";

import { artistKey, fromFileName, readCredit, splitCredit, splitJoint } from "./artists";

test("separators that only ever join artists always split", () => {
  expect(splitCredit("Total Science/FD")).toEqual(["Total Science", "FD"]);
  expect(splitCredit("Alok; Łaszewo; A$AP Rocky")).toEqual(["Alok", "Łaszewo", "A$AP Rocky"]);
  expect(splitCredit("Disclosure,Chris Lake,Leven Kali")).toEqual(["Disclosure", "Chris Lake", "Leven Kali"]);
  expect(splitCredit("FLAX， Young Gho$t")).toEqual(["FLAX", "Young Gho$t"]);
  expect(splitCredit("Chappell Roan x Vengaboys")).toEqual(["Chappell Roan", "Vengaboys"]);
  expect(splitCredit("Mason Vs Princess Superstar")).toEqual(["Mason", "Princess Superstar"]);
  expect(splitCredit("The Pussycat Dolls feat. Busta Rhymes")).toEqual(["The Pussycat Dolls", "Busta Rhymes"]);
  expect(splitCredit("Iiii (Abismo) Feat. Dnza")).toEqual(["Iiii (Abismo)", "Dnza"]);
  expect(splitCredit("JME ft Tempz")).toEqual(["JME", "Tempz"]);
  expect(splitCredit("Jack Ü (feat. Kai)")).toEqual(["Jack Ü", "Kai"]);
});

test("`&` is left for the library to decide, even beside other separators", () => {
  expect(splitCredit("Sigma & Julia Church")).toEqual(["Sigma & Julia Church"]);
  expect(splitCredit("Skrillex， Young Miko & Four Tet， contra")).toEqual(["Skrillex", "Young Miko & Four Tet", "contra"]);
  expect(splitCredit("Mood II Swing/Chase & Status")).toEqual(["Mood II Swing", "Chase & Status"]);
  expect(splitCredit("Fred Again, Skepta, & PlaqueBoyMax")).toEqual(["Fred Again", "Skepta", "PlaqueBoyMax"]);
});

test("names that hold a separator stay whole", () => {
  expect(splitCredit("AC/DC")).toEqual(["AC/DC"]);
  expect(splitCredit("Tyler, The Creator feat. Kali Uchis")).toEqual(["Tyler, The Creator", "Kali Uchis"]);
  expect(splitCredit("earth, wind & fire / AC/DC")).toEqual(["earth, wind & fire", "AC/DC"]);
  expect(splitCredit("10,000 Maniacs")).toEqual(["10,000 Maniacs"]);
  expect(splitCredit("Lil Nas X")).toEqual(["Lil Nas X"]);
  expect(splitCredit("Lil Nas X & Jack Harlow")).toEqual(["Lil Nas X & Jack Harlow"]);
});

test("web addresses and empty tags are not split", () => {
  expect(splitCredit("http://electronicfresh.com")).toEqual(["http://electronicfresh.com"]);
  expect(splitCredit("www.example.com/artist,name")).toEqual(["www.example.com/artist,name"]);
  expect(splitCredit("  ")).toEqual([]);
});

test("an artist is credited once, under the first spelling", () => {
  expect(splitCredit("Kara Okay, KARA OKAY/Newtone")).toEqual(["Kara Okay", "Newtone"]);
});

const library = (...names: string[]) => {
  const keys = new Set(names.map(artistKey));
  return (name: string) => keys.has(artistKey(name));
};

test("`&` splits only when a part is an artist in its own right", () => {
  expect(splitJoint("Skrillex & Feid", library("Skrillex"))).toEqual(["Skrillex", "Feid"]);
  expect(splitJoint("Hatiras and J Majik", library("j majik"))).toEqual(["Hatiras", "J Majik"]);
  expect(splitJoint("Low Steppa & Capri", library("Skrillex"))).toEqual(["Low Steppa & Capri"]);
  expect(splitJoint("Skrillex", library("Skrillex"))).toEqual(["Skrillex"]);
});

test("with several joins the longest known run is kept together", () => {
  const known = library("Camo & Krooked", "Mefjus", "Camo & Krooked & Mefjus");
  expect(splitJoint("Camo & Krooked & Mefjus", known)).toEqual(["Camo & Krooked", "Mefjus"]);
  expect(splitJoint("A & B & C", library("C"))).toEqual(["A & B", "C"]);
  expect(splitJoint("A & B & C", library("B"))).toEqual(["A", "B", "C"]);
});

test("known duos and `& The` bands never split", () => {
  expect(splitJoint("Gerra & Stone", library("Stone"))).toEqual(["Gerra & Stone"]);
  expect(splitJoint("Chase & Status & Bou", library("Bou"))).toEqual(["Chase & Status", "Bou"]);
  expect(splitJoint("Bob Marley & The Wailers", library("Bob Marley"))).toEqual(["Bob Marley & The Wailers"]);
});

test("a real list of values is taken as it stands", () => {
  // Repeated ARTIST: the single value is only the first one.
  expect(readCredit("Fred again..", ["Fred again..", "Anderson .Paak", "CHIKA"])).toEqual({
    credit: "Fred again.., Anderson .Paak, CHIKA",
    names: ["Fred again..", "Anderson .Paak", "CHIKA"],
  });
  // ARTIST and ARTISTS: shown as written, credited from the list.
  expect(readCredit("Chase & Status feat. Clementine Douglas", ["Chase & Status", "Clementine Douglas"])).toEqual({
    credit: "Chase & Status feat. Clementine Douglas",
    names: ["Chase & Status", "Clementine Douglas"],
  });
  expect(readCredit("A", ["A", "Earth, Wind & Fire / B"])?.names).toEqual(["A", "Earth, Wind & Fire / B"]);
});

test("a single value is split, and a list written as one string wins", () => {
  expect(readCredit("Total Science/FD", ["Total Science/FD"])).toEqual({ credit: "Total Science/FD", names: ["Total Science", "FD"] });
  expect(readCredit("BUNT. & Mapei", ["BUNT.;Mapei"])).toEqual({ credit: "BUNT. & Mapei", names: ["BUNT.", "Mapei"] });
  expect(readCredit(undefined, ["Commix"])).toEqual({ credit: "Commix", names: ["Commix"] });
  expect(readCredit(" ", [])).toBeNull();
});

test("fromFileName reads Artist - Title names, dropping a position and a placeholder artist", () => {
  expect(fromFileName("53 - Serum - Fly Paper VIP")).toEqual({ artist: "Serum", title: "Fly Paper VIP" });
  expect(fromFileName("065 Motiv - One More Day")).toEqual({ artist: "Motiv", title: "One More Day" });
  expect(fromFileName("Unknown - Napes - Tokyo Drifting (Final Digital Master)")).toEqual({ artist: "Napes", title: "Tokyo Drifting (Final Digital Master)" });
  expect(fromFileName("Rihanna - Pon de Replay (OJ's Speed Garage Remix)")).toEqual({ artist: "Rihanna", title: "Pon de Replay (OJ's Speed Garage Remix)" });
  // The title keeps any later dashes.
  expect(fromFileName("55 - 4K - MURDA STYLE - master")).toEqual({ artist: "4K", title: "MURDA STYLE - master" });
});

test("fromFileName guesses no artist without a spaced dash, and keeps numbers that belong to a name", () => {
  expect(fromFileName("56 - G6 KORI ARRANGMENT EDIT")).toEqual({ title: "G6 KORI ARRANGMENT EDIT" });
  expect(fromFileName("Unknown - 11RUPAKU")).toEqual({ title: "11RUPAKU" });
  expect(fromFileName("count down x lion king")).toEqual({ title: "count down x lion king" });
  expect(fromFileName("50 Cent - In Da Club")).toEqual({ artist: "50 Cent", title: "In Da Club" });
  expect(fromFileName("4K-dub")).toEqual({ title: "4K-dub" });
});
