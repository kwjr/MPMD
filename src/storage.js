// Standalone replacement for the Claude-artifact-only `window.storage` API.
// Same get/set call shape as the artifact version, backed by localStorage
// instead of Anthropic's per-account key/value store. That means data lives
// in *this browser* only — it won't sync across devices or browsers, and
// clearing site data / browsing data will erase it. If you outgrow that,
// swap this module for an IndexedDB-backed version without touching App.jsx.

const PREFIX = "ledger:";

export const storage = {
  async get(key) {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    } catch (e) {
      // most likely quota exceeded or storage disabled (private browsing, etc.)
      console.error("storage.set failed", e);
      return null;
    }
  },
};
