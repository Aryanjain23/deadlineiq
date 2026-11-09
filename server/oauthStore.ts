import fs from "fs";
import path from "path";

export interface StoredOAuthToken {
  userUid: string;
  service: "gmail" | "calendar" | "unified";
  refreshToken: string;
  connectedEmail: string | null;
  scopes: string[];
  updatedAt: string;
  lastSyncTime?: string;
  lastError?: string | null;
}

const TOKENS_FILE_PATH = path.resolve(process.cwd(), "data", "oauth-tokens.json");

function ensureDirectoryExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTokensStore(): Record<string, StoredOAuthToken> {
  try {
    if (fs.existsSync(TOKENS_FILE_PATH)) {
      const content = fs.readFileSync(TOKENS_FILE_PATH, "utf-8");
      return JSON.parse(content) || {};
    }
  } catch (err) {
    console.warn("Failed to load OAuth token store:", err);
  }
  return {};
}

function saveTokensStore(store: Record<string, StoredOAuthToken>): void {
  try {
    ensureDirectoryExists(TOKENS_FILE_PATH);
    fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write OAuth token store:", err);
  }
}

export function saveServerOAuthToken(token: StoredOAuthToken): void {
  const store = loadTokensStore();
  const key = `${token.userUid}_${token.service}`;
  store[key] = token;
  saveTokensStore(store);
}

export function getServerOAuthToken(userUid: string, service: "gmail" | "calendar" | "unified"): StoredOAuthToken | null {
  const store = loadTokensStore();
  const key = `${userUid}_${service}`;
  if (store[key]) return store[key];

  // Fallback to unified token
  const unifiedKey = `${userUid}_unified`;
  if (store[unifiedKey]) return store[unifiedKey];

  return null;
}

export function deleteServerOAuthToken(userUid: string, service: "gmail" | "calendar" | "unified" | "all"): void {
  const store = loadTokensStore();
  if (service === "all") {
    delete store[`${userUid}_gmail`];
    delete store[`${userUid}_calendar`];
    delete store[`${userUid}_unified`];
  } else {
    delete store[`${userUid}_${service}`];
  }
  saveTokensStore(store);
}

export function updateServerOAuthMetadata(
  userUid: string,
  service: "gmail" | "calendar" | "unified",
  updates: { lastSyncTime?: string; lastError?: string | null }
): void {
  const store = loadTokensStore();
  const key = `${userUid}_${service}`;
  if (store[key]) {
    store[key] = { ...store[key], ...updates, updatedAt: new Date().toISOString() };
    saveTokensStore(store);
    return;
  }
  const unifiedKey = `${userUid}_unified`;
  if (store[unifiedKey]) {
    store[unifiedKey] = { ...store[unifiedKey], ...updates, updatedAt: new Date().toISOString() };
    saveTokensStore(store);
  }
}
