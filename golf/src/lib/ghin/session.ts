"use client";

import { apiLogin, type GhinSessionInfo } from "../api";
import { loadGhinLogin, saveGhinLogin, saveGolferId, saveMe, saveRoster, saveToken } from "../storage";

/**
 * Staying signed in to GHIN.
 *
 * GHIN's session token lasts about a day, and getting a new one takes the
 * password. With "keep me signed in" on, the password is kept on this phone
 * — nowhere else — scrambled with a key the browser generates for this device
 * and will not hand out, so a copy of the phone's storage does not contain
 * it in the clear. When a lookup finds the session has run out, the app signs
 * in again by itself. Signing out forgets the password.
 */

const KEPT_KEY = "golfbets.ghinKeep.v1";
const DB_NAME = "onedowns-keys";
const STORE = "keys";
const KEY_ID = "ghin-keep";

interface Kept {
  login: string;
  password: string;
}

/** Whether this browser can keep the password: WebCrypto and IndexedDB both present. */
export function canKeepSignedIn(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.crypto?.subtle &&
    !!window.indexedDB &&
    !!window.localStorage
  );
}

/** Whether a password is kept on this phone. */
export function hasKeptCredentials(): boolean {
  try {
    return !!window.localStorage.getItem(KEPT_KEY);
  } catch {
    return false;
  }
}

function openKeys(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idb<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** This device's key: made once, stored where scripts can use it but never export it. */
async function deviceKey(): Promise<CryptoKey> {
  const db = await openKeys();
  try {
    const existing = await idb<CryptoKey | undefined>(db, "readonly", (store) => store.get(KEY_ID));
    if (existing) return existing;
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await idb(db, "readwrite", (store) => store.put(key, KEY_ID));
    return key;
  } finally {
    db.close();
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes)));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function keepCredentials(login: string, password: string): Promise<void> {
  const key = await deviceKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ login, password } satisfies Kept));
  const data = new Uint8Array(await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  window.localStorage.setItem(KEPT_KEY, JSON.stringify({ iv: toBase64(iv), data: toBase64(data) }));
}

export async function loadCredentials(): Promise<Kept | null> {
  try {
    const raw = window.localStorage.getItem(KEPT_KEY);
    if (!raw) return null;
    const { iv, data } = JSON.parse(raw) as { iv: string; data: string };
    const key = await deviceKey();
    const plain = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Kept;
  } catch {
    // A key that no longer matches, or storage wiped: nothing kept.
    return null;
  }
}

export function forgetCredentials(): void {
  try {
    window.localStorage.removeItem(KEPT_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** When a GHIN token runs out, from the expiry inside it; null when it does not say. */
export function tokenExpiresAt(token: string | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Whether the token has run out, or will within the hour. */
export function tokenNeedsRenewing(token: string | null, now = Date.now()): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && expiresAt - now < 60 * 60 * 1000;
}

/**
 * Sign in again with the kept password. Null when nothing is kept or GHIN
 * said no — the password is left in place either way, so a wrong one is
 * fixed by signing in again with "keep me signed in" ticked.
 */
export async function signInAgain(): Promise<GhinSessionInfo | null> {
  const kept = await loadCredentials();
  if (!kept) return null;
  try {
    const session = await apiLogin(kept.login, kept.password);
    saveToken(session.token);
    saveGhinLogin(kept.login);
    if (session.golferId) saveGolferId(session.golferId);
    if (session.me) {
      saveMe(session.me);
      saveRoster([session.me]);
    }
    return session;
  } catch {
    return null;
  }
}

/** The name box's last value, for prefilling the form after a failed renewal. */
export function keptLogin(): string | null {
  return loadGhinLogin();
}
