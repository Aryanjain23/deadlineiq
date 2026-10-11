import {
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getEventsCollectionRef,
  getEventDocRef,
  getUserDocRef,
  getFirebaseDb,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
  sanitizeForFirestore,
} from "@/lib/firebase";
import {
  loadEvents,
  saveEvents,
  type CalendarEvent,
} from "@/lib/calendar";
import type { FirestoreEventDocument } from "@/lib/firebase/types";

function isRealUserUid(uid?: string | null): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (uid === "guest" || uid === "default" || uid.startsWith("demo-")) return false;
  return true;
}

async function executeWithAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const isPermission =
      err?.code === "permission-denied" ||
      String(err?.message || "").includes("Missing or insufficient permissions") ||
      String(err?.message || "").includes("permission-denied");
    if (isPermission) {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          return await fn();
        } catch {}
      }
    }
    throw err;
  }
}

function normalizeFirestoreEvent(data: any): CalendarEvent {
  return {
    id: data.id,
    title: data.title || "Untitled Event",
    date: data.date || "",
    startTime: data.startTime || undefined,
    endTime: data.endTime || undefined,
    category: data.category || "Other",
    location: data.location || undefined,
    notes: data.notes || undefined,
    allDay: Boolean(data.allDay),
    googleEventId: data.googleEventId || undefined,
    googleCalendarId: data.googleCalendarId || undefined,
    isGoogleSynced: Boolean(data.isGoogleSynced),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

/**
 * Loads calendar events exclusively for the authenticated user's Firestore records.
 * Returns empty array if none exist (never injects demo data).
 */
export async function getEvents(uid: string, fallbackKey = "default"): Promise<CalendarEvent[]> {
  const cacheKey = uid || fallbackKey;
  const path = `users/${uid}/events`;

  if (!isRealUserUid(uid)) {
    return loadEvents(cacheKey);
  }

  const db = getFirebaseDb();
  if (!db) {
    return loadEvents(cacheKey);
  }

  // 1. Check subcollection first
  const colRef = uid ? getEventsCollectionRef(uid) : null;
  if (colRef) {
    try {
      const snap = await executeWithAuthRetry(() => getDocs(colRef));
      if (!snap.empty) {
        const items: CalendarEvent[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreEvent(data));
        }
        console.log(`[FIRESTORE READ]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${items.length}`);
        saveEvents(cacheKey, items);
        return items;
      }
    } catch (error) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: events subcollection:`, error);
    }
  }

  // 2. Fall back to user document root
  const userDocRef = getUserDocRef(uid);
  if (userDocRef) {
    try {
      const uSnap = await executeWithAuthRetry(() => getDoc(userDocRef));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (Array.isArray(uData?.events) && uData.events.length > 0) {
          const items: CalendarEvent[] = uData.events
            .filter((e: any) => e && !e.id?.startsWith("demo-") && !e.id?.startsWith("sample-"))
            .map((e: any) => normalizeFirestoreEvent(e));
          console.log(`[FIRESTORE READ]\nfeature: events\nuid: ${uid}\npath: users/${uid}\ndocumentsFound: ${items.length}`);
          saveEvents(cacheKey, items);
          return items;
        }
      }
    } catch (uErr) {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: events user document:`, uErr);
    }
  }

  return loadEvents(cacheKey);
}

/**
 * Creates a new calendar event for the authenticated user.
 */
export async function createEvent(
  uid: string,
  event: CalendarEvent,
  fallbackKey = "default"
): Promise<CalendarEvent> {
  const cacheKey = uid || fallbackKey;
  const now = new Date().toISOString();
  const path = `users/${uid}/events/${event.id}`;
  const normalized: FirestoreEventDocument = {
    id: event.id,
    title: event.title.trim(),
    date: event.date,
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    category: event.category || "Other",
    location: event.location || "",
    notes: event.notes || "",
    allDay: Boolean(event.allDay),
    googleEventId: event.googleEventId || "",
    googleCalendarId: event.googleCalendarId || "",
    isGoogleSynced: Boolean(event.isGoogleSynced),
    createdAt: event.createdAt || now,
    updatedAt: now,
  };

  const local = loadEvents(cacheKey);
  const updatedLocal = [event, ...local.filter((e) => e.id !== event.id)];
  saveEvents(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              events: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
        console.log(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: users/${uid}\ndocumentId: ${event.id}\nsuccess: true`);
      } catch (uErr) {
        console.warn(`[FIRESTORE WRITE]\nfeature: events user doc warning:`, uErr);
      }
    }

    const docRef = getEventDocRef(uid, event.id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(docRef, sanitizeForFirestore(normalized), { merge: true })
        );
        console.log(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${event.id}\nsuccess: true`);
      } catch (error) {
        if (userDocSaved) {
          console.log(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${event.id}\nsuccess: true (persisted to user document)`);
        } else {
          console.error(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${event.id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.WRITE, path, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }

  return event;
}

/**
 * Updates an existing calendar event.
 */
export async function updateEvent(
  uid: string,
  id: string,
  updates: Partial<CalendarEvent>,
  fallbackKey = "default"
): Promise<void> {
  const cacheKey = uid || fallbackKey;
  const path = `users/${uid}/events/${id}`;
  const now = new Date().toISOString();

  const local = loadEvents(cacheKey);
  const updatedLocal = local.map((e) => (e.id === id ? { ...e, ...updates } : e));
  saveEvents(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              events: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getEventDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            docRef,
            sanitizeForFirestore({
              ...updates,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        console.log(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true`);
      } catch (error) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.UPDATE, path, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }
}

/**
 * Deletes a calendar event.
 */
export async function deleteEvent(
  uid: string,
  id: string,
  fallbackKey = "default"
): Promise<void> {
  const cacheKey = uid || fallbackKey;
  const path = `users/${uid}/events/${id}`;
  const now = new Date().toISOString();

  const local = loadEvents(cacheKey);
  const updatedLocal = local.filter((e) => e.id !== id);
  saveEvents(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isRealUserUid(uid)) {
    let userDocSaved = false;
    const userDocRef = getUserDocRef(uid);
    if (userDocRef) {
      try {
        await executeWithAuthRetry(() =>
          setDoc(
            userDocRef,
            sanitizeForFirestore({
              events: updatedLocal,
              updatedAt: now,
            }),
            { merge: true }
          )
        );
        userDocSaved = true;
      } catch {}
    }

    const docRef = getEventDocRef(uid, id);
    if (docRef) {
      try {
        await executeWithAuthRetry(() => deleteDoc(docRef));
        console.log(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: true (deleted)`);
      } catch (error) {
        if (!userDocSaved) {
          console.error(`[FIRESTORE WRITE]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentId: ${id}\nsuccess: false`, error);
          handleFirestoreError(error, OperationType.DELETE, path, getFirebaseAuth()?.currentUser);
        }
      }
    }
  }
}

/**
 * Real-time subscription to user's calendar events.
 */
export function subscribeToEvents(
  uid: string,
  onUpdate: (events: CalendarEvent[]) => void,
  fallbackKey = "default"
): () => void {
  const cacheKey = uid || fallbackKey;
  const path = `users/${uid}/events`;

  onUpdate(loadEvents(cacheKey));

  if (!isRealUserUid(uid)) {
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getEventsCollectionRef(uid) : null;
  const userDocRef = uid ? getUserDocRef(uid) : null;

  if (!db || !colRef) {
    return () => {};
  }

  let userDocUnsub: (() => void) | null = null;

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const count = snapshot.empty ? 0 : snapshot.docs.length;
      console.log(`[FIRESTORE READ]\nfeature: events\nuid: ${uid}\npath: ${path}\ndocumentsFound: ${count}`);
      if (!snapshot.empty) {
        const items: CalendarEvent[] = [];
        for (const d of snapshot.docs) {
          const data = d.data();
          if (data.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
            deleteDoc(d.ref).catch(() => {});
            continue;
          }
          items.push(normalizeFirestoreEvent(data));
        }
        saveEvents(cacheKey, items);
        onUpdate(items);
      }
    },
    (error) => {
      console.warn(`[FIRESTORE READ FAILED]\nfeature: events subcollection, switching to user doc listener:`, error);
      if (userDocRef && !userDocUnsub) {
        userDocUnsub = onSnapshot(
          userDocRef,
          (uSnap) => {
            if (uSnap.exists()) {
              const uData = uSnap.data();
              if (Array.isArray(uData?.events)) {
                const items = uData.events
                  .filter((e: any) => e && !e.id?.startsWith("demo-") && !e.id?.startsWith("sample-"))
                  .map((e: any) => normalizeFirestoreEvent(e));
                saveEvents(cacheKey, items);
                onUpdate(items);
              }
            }
          },
          () => {
            onUpdate(loadEvents(cacheKey));
          }
        );
      } else {
        onUpdate(loadEvents(cacheKey));
      }
    }
  );

  return () => {
    unsubscribe();
    if (userDocUnsub) userDocUnsub();
  };
}
