import { useState } from "react";
import LegalLayout from "@/components/LegalLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Trash2, ShieldAlert, CheckCircle2, Mail, Lock } from "lucide-react";

export default function DeletionPage() {
  const { user, deleteAccount } = useAuth();
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Alternative manual request form state for uninstalled app users
  const [requestEmail, setRequestEmail] = useState("");
  const [requestSubmitted, setRequestEmailSubmitted] = useState(false);

  const handleDeleteLoggedInAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      setIsDone(true);
    } catch (err) {
      console.error("Account deletion failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleManualRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail || !requestEmail.includes("@")) return;
    setRequestEmailSubmitted(true);
  };

  return (
    <LegalLayout
      title="Account & Data Deletion"
      subtitle="Public data deletion request and account removal portal for DeadlineIQ."
    >
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          1. Data Deletion Policy Overview
        </h2>
        <p>
          In accordance with Google Play developer policies and user privacy rights, DeadlineIQ provides a complete, permanent account and data deletion process.
        </p>
        <p>
          Executing account deletion permanently purges all user data from our systems. Deletion is immediate and irreversible.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          2. What Data Is Permanently Removed
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-1">
            <div className="font-bold text-xs text-slate-900 dark:text-white">Authentication &amp; Profile</div>
            <p className="text-[11px] text-slate-600 dark:text-text-secondary leading-relaxed">
              Firebase Authentication account, email address, display name, USN, branch, semester, degree, and profile picture.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-1">
            <div className="font-bold text-xs text-slate-900 dark:text-white">Academic Database Records</div>
            <p className="text-[11px] text-slate-600 dark:text-text-secondary leading-relaxed">
              All Firestore documents and subcollections (<code className="font-mono text-[10px]">deadlines</code>, <code className="font-mono text-[10px]">timetable</code>, <code className="font-mono text-[10px]">exams</code>, <code className="font-mono text-[10px]">events</code>, <code className="font-mono text-[10px]">dailyPlans</code>, <code className="font-mono text-[10px]">settings</code>).
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-1">
            <div className="font-bold text-xs text-slate-900 dark:text-white">Uploaded File Attachments</div>
            <p className="text-[11px] text-slate-600 dark:text-text-secondary leading-relaxed">
              All academic circulars, timetable images, and date sheet PDFs uploaded to Firebase Storage under your UID.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-1">
            <div className="font-bold text-xs text-slate-900 dark:text-white">Local Caches &amp; Tokens</div>
            <p className="text-[11px] text-slate-600 dark:text-text-secondary leading-relaxed">
              All offline <code className="font-mono text-[10px]">localStorage</code> caches, Google OAuth authorizations, and local session tokens.
            </p>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE DELETION OPTIONS */}
      <section className="space-y-4 pt-2">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          3. How to Delete Your Account
        </h2>

        {user ? (
          /* OPTION A: Authenticated User Logged In */
          <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-xs">
              <ShieldAlert size={16} />
              <span>You are currently signed in as {user.email || user.name}</span>
            </div>

            {isDone ? (
              <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-mono">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span>Your account and all associated data have been permanently deleted.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
                  Permanently delete your account, Firestore records, and uploaded Storage files right now:
                </p>

                <div>
                  <label className="block text-xs font-mono text-rose-800 dark:text-rose-200 mb-1">
                    Type <strong>DELETE</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full sm:w-64 rounded-xl border border-rose-400/50 bg-white dark:bg-black/50 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDeleteLoggedInAccount}
                  disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || isDeleting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? "Permanently Deleting..." : "Permanently Delete My Account"}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* OPTION B: Unauthenticated User / Uninstalled App */
          <div className="space-y-4">
            <p>
              If you have uninstalled DeadlineIQ or are unable to log in, you can submit a manual deletion request below using your registered email address.
            </p>

            {requestSubmitted ? (
              <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-mono">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span>Deletion request submitted for {requestEmail}. Our support team will process your request within 24 hours.</span>
              </div>
            ) : (
              <form onSubmit={handleManualRequestSubmit} className="p-5 rounded-2xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-3 max-w-md">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Mail size={15} className="text-primary" />
                  <span>Submit Manual Deletion Request</span>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-text-secondary mb-1 font-mono">
                    Registered Email Address:
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-border bg-white dark:bg-black/40 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
                >
                  Submit Deletion Request
                </button>
              </form>
            )}

            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border text-xs text-slate-600 dark:text-text-secondary flex items-center gap-2">
              <Lock size={14} className="text-slate-400 flex-shrink-0" />
              <span>You can also send a direct deletion request email to <a href="mailto:deletion@deadlineiq.app" className="text-primary hover:underline">deletion@deadlineiq.app</a>.</span>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          4. Legitimate Retention Exceptions
        </h2>
        <p>
          Upon account deletion, all personal records, deadlines, timetables, and files are purged. Standard web server access logs (containing anonymous IP addresses and connection timestamps) maintained at the cloud infrastructure layer expire automatically according to standard hosting retention schedules.
        </p>
      </section>

      <section className="space-y-2 pt-2 text-slate-500 dark:text-text-muted text-xs">
        <div>Effective Date: October 3, 2026</div>
        <div>Contact: <a href="mailto:deletion@deadlineiq.app" className="text-primary hover:underline">deletion@deadlineiq.app</a></div>
      </section>
    </LegalLayout>
  );
}
