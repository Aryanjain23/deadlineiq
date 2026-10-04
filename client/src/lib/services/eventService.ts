import {
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  getEventsCollectionRef,
  getEventDocRef,
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

function isFirebaseAuthForUid(uid: string): boolean {
  if (!uid || uid.startsWith("demo-")) return false;
  const auth = getFirebaseAuth();
  return Boolean(auth?.currentUser && auth.currentUser.uid === uid);
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

  if (!isFirebaseAuthForUid(uid)) {
    return loadEvents(cacheKey);
  }

  const db = getFirebaseDb();
  const colRef = uid ? getEventsCollectionRef(uid) : null;

  if (!db || !colRef) {
    return loadEvents(cacheKey);
  }

  try {
    const snap = await getDocs(colRef);
    if (snap.empty) {
      saveEvents(cacheKey, []);
      return [];
    }

    const items: CalendarEvent[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
        deleteDoc(d.ref).catch((err) => console.warn("Purged legacy test event doc:", err));
        continue;
      }
      items.push(normalizeFirestoreEvent(data));
    }

    saveEvents(cacheKey, items);
    return items;
  } catch (error) {
    console.warn("Firestore getEvents failed, falling back to local cache:", error);
    return loadEvents(cacheKey);
  }
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
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getEventDocRef(uid, event.id);
    if (docRef) {
      try {
        await setDoc(docRef, sanitizeForFirestore(normalized), { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${uid}/events/${event.id}`, getFirebaseAuth()?.currentUser);
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
  const local = loadEvents(cacheKey);
  const updatedLocal = local.map((e) => (e.id === id ? { ...e, ...updates } : e));
  saveEvents(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getEventDocRef(uid, id);
    if (docRef) {
      try {
        await setDoc(
          docRef,
          sanitizeForFirestore({
            ...updates,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/events/${id}`, getFirebaseAuth()?.currentUser);
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
  const local = loadEvents(cacheKey);
  const updatedLocal = local.filter((e) => e.id !== id);
  saveEvents(cacheKey, updatedLocal);

  const db = getFirebaseDb();
  if (db && isFirebaseAuthForUid(uid)) {
    const docRef = getEventDocRef(uid, id);
    if (docRef) {
      try {
        await deleteDoc(docRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${uid}/events/${id}`, getFirebaseAuth()?.currentUser);
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

  if (!isFirebaseAuthForUid(uid)) {
    onUpdate(loadEvents(cacheKey));
    return () => {};
  }

  const db = getFirebaseDb();
  const colRef = uid ? getEventsCollectionRef(uid) : null;

  if (!db || !colRef) {
    onUpdate(loadEvents(cacheKey));
    return () => {};
  }

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: CalendarEvent[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.id?.startsWith("demo-") || d.id?.startsWith("demo-") || data.id?.startsWith("sample-")) {
          deleteDoc(d.ref).catch(() => {});
          continue;
        }
        items.push(normalizeFirestoreEvent(data));
      }
      saveEvents(cacheKey, items);
      onUpdate(items);
    },
    (error) => {
      console.warn("Events onSnapshot error, falling back to local cache:", error);
      onUpdate(loadEvents(cacheKey));
    }
  );

  return unsubscribe;
}
