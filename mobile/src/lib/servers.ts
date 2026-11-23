import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { agreeKey } from "./sealed";

/** A server this phone is paired with, and whose account it is paired as. */
export type Server = {
  id: string;
  /** The address it was added by, without a trailing slash. */
  url: string;
  name: string;
  user: { id: string; name: string; username: string; isAdmin: boolean };
  /** This device's token: an app password on the server, revocable there. Sent as a bearer token. */
  token: string;
  /** This device's public key, sent with requests for sealed audio. */
  deviceKey: string;
  /** Opens audio the server sealed for this device. */
  sealKey: string;
};

type Servers = {
  servers: Server[];
  activeId: string | null;
  /** False until the saved servers have been read at launch. */
  ready: boolean;
  /** Keep streamed tracks sealed too. They start once they have fully arrived. */
  sealStreams: boolean;
  load: () => Promise<void>;
  add: (server: Server) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  setSealStreams: (on: boolean) => void;
};

// Tokens and keys are secrets, so the whole list lives in the keychain.
const storageKey = "crate.servers.v1";
const save = (state: Pick<Servers, "servers" | "activeId" | "sealStreams">) =>
  void SecureStore.setItemAsync(storageKey, JSON.stringify({ servers: state.servers, activeId: state.activeId, sealStreams: state.sealStreams }));

/** The servers this phone knows, and the one in use. Several can be paired; one is active at a time. */
export const useServers = create<Servers>()((set, get) => ({
  servers: [],
  activeId: null,
  ready: false,
  sealStreams: true,
  load: async () => {
    const saved = await SecureStore.getItemAsync(storageKey).catch(() => null);
    const parsed = saved ? (JSON.parse(saved) as Partial<Pick<Servers, "servers" | "activeId" | "sealStreams">>) : {};
    set({ servers: parsed.servers ?? [], activeId: parsed.activeId ?? null, sealStreams: parsed.sealStreams ?? true, ready: true });
  },
  add: (server) => {
    set({ servers: [...get().servers.filter((other) => other.id !== server.id), server], activeId: server.id });
    save(get());
  },
  remove: (id) => {
    const servers = get().servers.filter((server) => server.id !== id);
    set({ servers, activeId: get().activeId === id ? (servers[0]?.id ?? null) : get().activeId });
    save(get());
  },
  setActive: (activeId) => {
    set({ activeId });
    save(get());
  },
  setSealStreams: (sealStreams) => {
    set({ sealStreams });
    save(get());
  },
}));

export const useActiveServer = () => useServers((state) => state.servers.find((server) => server.id === state.activeId) ?? null);
export const activeServer = () => useServers.getState().servers.find((server) => server.id === useServers.getState().activeId) ?? null;

/** What every request to a server carries: who this device is, and what it is. */
export const authHeaders = (server: Pick<Server, "token">) => ({
  Authorization: `Bearer ${server.token}`,
  "x-crate-client": `Crate for iOS${Device.modelName ? `, ${Device.modelName}` : ""}`,
});

/** An address as typed, made whole: "192.168.1.20:3000" becomes "http://192.168.1.20:3000". */
export function normaliseUrl(typed: string) {
  const trimmed = typed.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

type Hello = { app: string; name: string; version: string; protocol: number; key: string };

/** Asks an address whether it is one of our servers. Throws with words a person can read when it isn't, or can't be reached. */
export async function hello(url: string): Promise<Hello> {
  const response = await fetch(`${url}/api/app/hello`).catch(() => null);
  if (!response) throw new Error("Couldn't reach that address. Check it, and that this phone is on the same network.");
  const found = response.ok ? ((await response.json().catch(() => null)) as Hello | null) : null;
  if (found?.app !== "crate") throw new Error("That address answered, but it isn't a Crate server.");
  if (found.protocol !== 1) throw new Error("That server needs a newer version of this app.");
  return found;
}

/**
 * Pairs this phone with an account on a server. The password is used this
 * once and not kept. What is kept is a token of the phone's own, which shows
 * under Music apps on the server and can be revoked there, and the key that
 * opens audio the server seals for this phone.
 */
export async function pair(url: string, username: string, password: string): Promise<Server> {
  const server = await hello(url);
  const response = await fetch(`${url}/api/app/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, device: Device.deviceName ?? Device.modelName ?? "iPhone" }),
  }).catch(() => null);
  if (!response) throw new Error("Couldn't reach the server.");
  const body = (await response.json().catch(() => null)) as { token?: string; user?: Server["user"]; message?: string } | null;
  if (!response.ok || !body?.token || !body.user) throw new Error(body?.message ?? "Couldn't sign in.");
  return { id: `${url}#${body.user.id}`, url, name: server.name, user: body.user, token: body.token, ...agreeKey(server.key) };
}

/** Signs this phone out of a server: its token stops working there, and it is forgotten here. */
export async function unpair(server: Server) {
  await fetch(`${server.url}/api/app/unpair`, { method: "POST", headers: authHeaders(server) }).catch(() => null);
  useServers.getState().remove(server.id);
}
