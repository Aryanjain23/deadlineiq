import {
  getFirestore,
  collection,
  doc,
  type Firestore,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { getFirebaseApp, getFirebaseConfig } from "./config";
import { handleFirestoreError, OperationType } from "./errors";
import type {
  UserProfileDocument,
  FirestoreDeadlineDocument,
  FirestoreTimetableDocument,
  FirestoreUserSettingsDocument,
  FirestoreSourceDocument,
} from "./types";

let dbInstance: Firestore | null = null;

export function getFirebaseDb(): Firestore | null {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    const config = getFirebaseConfig();
    dbInstance = config.firestoreDatabaseId
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);
    return dbInstance;
  } catch (error) {
    console.warn("Firestore could not be initialized:", error);
    return null;
  }
}

/**
 * Strongly-typed Firestore path references.
 * Guarantees strict containment within users/{uid}/...
 */
export function getUserDocRef(uid: string): DocumentReference<UserProfileDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid) as DocumentReference<UserProfileDocument>;
}

export function getDeadlinesCollectionRef(
  uid: string
): CollectionReference<FirestoreDeadlineDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "deadlines") as CollectionReference<FirestoreDeadlineDocument>;
}

export function getDeadlineDocRef(
  uid: string,
  deadlineId: string
): DocumentReference<FirestoreDeadlineDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "deadlines", deadlineId) as DocumentReference<FirestoreDeadlineDocument>;
}

export function getTimetableCollectionRef(
  uid: string
): CollectionReference<FirestoreTimetableDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "timetable") as CollectionReference<FirestoreTimetableDocument>;
}

export function getTimetableDocRef(
  uid: string,
  entryId: string
): DocumentReference<FirestoreTimetableDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "timetable", entryId) as DocumentReference<FirestoreTimetableDocument>;
}

export function getUserSettingsDocRef(
  uid: string
): DocumentReference<FirestoreUserSettingsDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "settings", "preferences") as DocumentReference<FirestoreUserSettingsDocument>;
}

export function getSourcesCollectionRef(
  uid: string
): CollectionReference<FirestoreSourceDocument> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "sources") as CollectionReference<FirestoreSourceDocument>;
}

export function getExamsCollectionRef(
  uid: string
): CollectionReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "exams");
}

export function getExamDocRef(
  uid: string,
  examId: string
): DocumentReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "exams", examId);
}

export function getEventsCollectionRef(
  uid: string
): CollectionReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "events");
}

export function getEventDocRef(
  uid: string,
  eventId: string
): DocumentReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "events", eventId);
}

export function getDailyPlansCollectionRef(
  uid: string
): CollectionReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "users", uid, "dailyPlans");
}

export function getDailyPlanDocRef(
  uid: string,
  planId: string
): DocumentReference<any> | null {
  const db = getFirebaseDb();
  if (!db) return null;
  return doc(db, "users", uid, "dailyPlans", planId);
}

export { handleFirestoreError, OperationType };
