import LegalLayout from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="Terms and conditions governing the use of DeadlineIQ academic planning services."
    >
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          1. Acceptance of Terms
        </h2>
        <p>
          By creating an account, signing in, or using DeadlineIQ, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          2. Eligibility &amp; Account Responsibility
        </h2>
        <p>
          DeadlineIQ is designed for university and college students to organize academic tasks, timetables, and date sheets.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>You are responsible for maintaining the confidentiality of your authentication credentials.</li>
          <li>You are responsible for all activities that occur under your account.</li>
          <li>You agree to notify us immediately of any unauthorized account access.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          3. User Content &amp; Uploaded Documents
        </h2>
        <p>
          You retain complete ownership of all academic notices, circulars, timetables, date sheets, and coursework descriptions you upload or enter into DeadlineIQ.
        </p>
        <p>
          By uploading documents to AI Extract or AI Import, you grant DeadlineIQ the limited right to process the file content solely to perform the requested parsing and schedule generation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          4. AI-Generated Results Disclaimer
        </h2>
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
          <strong>Academic Verification Responsibility:</strong> AI Extract, AI Timetable Import, AI Exam Import, and Plan My Day are organizational tools engineered to assist study planning. Users remain solely responsible for verifying official university circulars, professor announcements, and exam date sheets. DeadlineIQ is an organizational aid and does not guarantee academic grades or university submission deadlines.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          5. Acceptable Use &amp; Prohibited Conduct
        </h2>
        <p>
          You agree not to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Attempt to bypass Firestore or Storage security rules or access another user's data.</li>
          <li>Submit malicious code, viruses, or harmful scripts.</li>
          <li>Probe, scan, or test the vulnerability of the system without authorization.</li>
          <li>Use automated bots or scrapers to overload service endpoints.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          6. Account Deletion &amp; Termination
        </h2>
        <p>
          You retrain the full right to delete your account permanently at any time via Account Settings or our public <a href="/delete-account" className="text-primary hover:underline">Account Deletion Page</a>.
        </p>
        <p>
          We reserve the right to suspend or terminate accounts that violate acceptable use policies or engage in security abuse.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          7. Limitation of Liability
        </h2>
        <p>
          DeadlineIQ is provided "as is" without warranty of any kind. To the maximum extent permitted by applicable law, DeadlineIQ and its operators shall not be liable for indirect, incidental, or consequential damages resulting from service interruptions or missed academic deadlines. Nothing in these terms excludes liability that cannot be excluded under applicable law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          8. Governing Law
        </h2>
        <p>
          These terms shall be governed by and construed in accordance with applicable governing laws, without giving effect to any principles of conflicts of law.
        </p>
      </section>

      <section className="space-y-2 pt-2 text-slate-500 dark:text-text-muted text-xs">
        <div>Effective Date: October 3, 2026</div>
        <div>Support Contact: <a href="mailto:support@deadlineiq.app" className="text-primary hover:underline">support@deadlineiq.app</a></div>
      </section>
    </LegalLayout>
  );
}
