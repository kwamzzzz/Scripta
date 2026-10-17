const RELEASE_DATA_VERSION = "2026-09-fresh-start";
const VERSION_KEY = "px.release-data-version";

type BrowserStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;

function removePraxisKeys(storage: BrowserStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("px.")) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

/** Remove account-scoped drafts and UI state without touching Supabase auth keys. */
export function clearPraxisClientData(
  local: BrowserStorage = window.localStorage,
  session: BrowserStorage = window.sessionStorage,
) {
  removePraxisKeys(local);
  removePraxisKeys(session);
}

/** One-time release migration that prevents old prototype data leaking into a new account. */
export function migratePraxisClientData(
  local: BrowserStorage = window.localStorage,
  session: BrowserStorage = window.sessionStorage,
) {
  if (local.getItem(VERSION_KEY) === RELEASE_DATA_VERSION) return;
  clearPraxisClientData(local, session);
  local.setItem(VERSION_KEY, RELEASE_DATA_VERSION);
}
