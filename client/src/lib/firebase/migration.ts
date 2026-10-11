import { doc, setDoc } from "firebase/firestore";
import { getFirebaseDb, getDeadlinesCollectionRef, getTimetableCollectionRef, getUserDocRef, sanitizeForFirestore } from "./firestore";
import { loadDeadlines, type Deadline } from "@/lib/deadlines";
import { loadTimetable, type TimetableEntry } from "@/lib/timetable";
import type { FirestoreDeadlineDocument, FirestoreTimetableDocument, UserProfileDocument } from "./types";

export interface MigrationResult {
  migrated: boolean;
  deadlinesCount: number;
  timetableCount: number;
  error?: string;
}

const MIGRATION_FLAG_PREFIX = "deadlineiq_migrated_";

export function isUserMigrated(uid: string): boolean {
  try {
    return localStorage.getItem(`${MIGRATION_FLAG_PREFIX}${uid}`) === "true";
  } catch {
    return false;
  }
}

export function markUserMigrated(uid: string): void {
  try {
    localStorage.setItem(`${MIGRATION_FLAG_PREFIX}${uid}`, "true");
  } catch (error) {
    console.warn("Could not save migration flag in localStorage:", error);
  }
}

/**
 * Safely migrates local storage data to Cloud Firestore for an authenticated user.
 * CRITICAL: Does NOT delete the local data so offline fallback continues working.
 */
export async function migrateLocalStorageToFirestore(
  uid: string,
  usn: string,
  userProfile?: Partial<UserProfileDocument>
): Promise<MigrationResult> {
  const db = getFirebaseDb();
  if (!db) {
    return { migrated: false, deadlinesCount: 0, timetableCount: 0, error: "Firebase not configured." };
  }

  if (isUserMigrated(uid)) {
    return { migrated: false, deadlinesCount: 0, timetableCount: 0 };
  }

  let deadlinesMigrated = 0;
  let timetableMigrated = 0;

  try {
    // 1. Ensure user profile document exists
    const userRef = getUserDocRef(uid);
    if (userRef) {
      const now = new Date().toISOString();
      const profileData: UserProfileDocument = {
        uid,
        displayName: userProfile?.displayName || "Student",
        email: userProfile?.email || null,
        usn: usn || userProfile?.usn || "",
        branch: userProfile?.branch || "",
        semester: userProfile?.semester || "",
        college: userProfile?.college || "",
        degree: userProfile?.degree || "",
        photoURL: userProfile?.photoURL || null,
        createdAt: userProfile?.createdAt || now,
        updatedAt: now,
      };
      await setDoc(userRef, sanitizeForFirestore(profileData), { merge: true });
    }

    // 2. Migrate Local Deadlines (only legitimate user-created items)
    const localDeadlines: Deadline[] = loadDeadlines(usn || uid);
    const deadlinesCol = getDeadlinesCollectionRef(uid);
    if (deadlinesCol && localDeadlines.length > 0) {
      for (const d of localDeadlines) {
        if (!d || d.id?.startsWith("demo-")) continue;
        const deadlineDocRef = doc(deadlinesCol, d.id);
        const firestoreDeadline: FirestoreDeadlineDocument = {
          id: d.id,
          taskName: d.taskName,
          subject: d.subject,
          description: d.description || "",
          dueDate: d.dueDate,
          dueTime: d.dueTime || "23:59",
          importance: d.importance,
          completed: Boolean(d.completed),
          createdAt: d.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: d.source || "manual",
          sourceType: d.sourceType || "manual",
          sourceId: d.sourceId,
          dateSource: d.dateSource,
          confidence: d.confidence,
          timetableDerived: d.timetableDerived,
        };
        await setDoc(deadlineDocRef, sanitizeForFirestore(firestoreDeadline), { merge: true });
        deadlinesMigrated++;
      }
    }

    // 3. Migrate Local Timetable (only legitimate user-created items)
    const localTimetable: TimetableEntry[] = loadTimetable(usn || uid);
    const timetableCol = getTimetableCollectionRef(uid);
    if (timetableCol && localTimetable.length > 0) {
      for (const t of localTimetable) {
        if (!t || t.id?.startsWith("tt-")) continue;
        const timetableDocRef = doc(timetableCol, t.id);
        const firestoreEntry: FirestoreTimetableDocument = {
          id: t.id,
          day: t.day,
          subject: t.subject,
          subjectCode: t.subjectCode || "",
          startTime: t.startTime,
          endTime: t.endTime,
          room: t.room || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(timetableDocRef, sanitizeForFirestore(firestoreEntry), { merge: true });
        timetableMigrated++;
      }
    }

    // Mark migration complete
    markUserMigrated(uid);

    return {
      migrated: true,
      deadlinesCount: deadlinesMigrated,
      timetableCount: timetableMigrated,
    };
  } catch (error) {
    console.error("Migration error:", error);
    return {
      migrated: false,
      deadlinesCount: deadlinesMigrated,
      timetableCount: timetableMigrated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
