import fs from "node:fs";
import path from "node:path";

export interface AccountRecord {
  email: string;
  uid?: string;
  displayName?: string;
  usn?: string;
  createdAt: string;
}

const dataDir = path.resolve(process.cwd(), "data");
const registryFile = path.join(dataDir, "registered_accounts.json");

if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.warn("Could not create data dir:", e);
  }
}

const accounts = new Map<string, AccountRecord>();

// Pre-seed demo student account
accounts.set("student@nie.ac.in", {
  email: "student@nie.ac.in",
  displayName: "Aryan",
  usn: "4NI25EC023",
  createdAt: "2026-01-01T00:00:00.000Z",
});

if (fs.existsSync(registryFile)) {
  try {
    const raw = fs.readFileSync(registryFile, "utf-8");
    const list: AccountRecord[] = JSON.parse(raw);
    for (const item of list) {
      if (item?.email) {
        accounts.set(item.email.toLowerCase().trim(), item);
      }
    }
  } catch (err) {
    console.warn("Error reading registry file:", err);
  }
}

function persist() {
  try {
    const list = Array.from(accounts.values());
    fs.writeFileSync(registryFile, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("Error persisting registry file:", err);
  }
}

export function checkAccount(email: string): { exists: boolean; record?: AccountRecord } {
  const clean = email.toLowerCase().trim();
  const record = accounts.get(clean);
  return { exists: Boolean(record), record };
}

export function registerAccount(record: {
  email: string;
  uid?: string;
  displayName?: string;
  usn?: string;
}): AccountRecord {
  const clean = record.email.toLowerCase().trim();
  const existing = accounts.get(clean);
  const now = new Date().toISOString();
  const entry: AccountRecord = {
    email: clean,
    uid: record.uid || existing?.uid,
    displayName: record.displayName || existing?.displayName || "Student",
    usn: record.usn || existing?.usn || "",
    createdAt: existing?.createdAt || now,
  };
  accounts.set(clean, entry);
  persist();
  return entry;
}

export function unregisterAccount(email: string): boolean {
  const clean = email.toLowerCase().trim();
  const deleted = accounts.delete(clean);
  if (deleted) persist();
  return deleted;
}
