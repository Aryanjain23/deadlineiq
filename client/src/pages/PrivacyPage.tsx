import LegalLayout from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="Comprehensive breakdown of data collection, processing, and security practices in DeadlineIQ."
    >
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          1. About DeadlineIQ &amp; Data Ownership
        </h2>
        <p>
          DeadlineIQ is an academic planning application designed for college and university students to manage course assignments, lab submissions, class timetables, exam date sheets, and daily study schedules.
        </p>
        <p>
          We operate under a simple principle: <strong>your academic records and coursework belong exclusively to you</strong>. DeadlineIQ does not sell, monetize, or share student data with advertisers, data brokers, or marketing networks.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          2. Account &amp; Profile Information
        </h2>
        <p>
          When you register or sign in to DeadlineIQ, the following account information is processed:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Email Address:</strong> Used for account sign-in, session verification, and password reset dispatches.</li>
          <li><strong>Display Name &amp; Profile Picture:</strong> Displayed within the application header and account profile.</li>
          <li><strong>University Seat Number (USN) &amp; Academic Details:</strong> Optional student registration ID, branch, semester, degree, and college name provided in your account profile.</li>
          <li><strong>Phone Number:</strong> Optional contact field if explicitly added to your profile settings.</li>
          <li><strong>Firebase Unique Identifier (UID):</strong> An encrypted system key generated upon account creation to isolate your data.</li>
        </ul>
        <p className="text-slate-500 dark:text-text-muted text-xs">
          Note: Account passwords are managed directly by Firebase Authentication and are <strong>never</strong> accessible to or stored within DeadlineIQ databases.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          3. Academic Data &amp; Cloud Storage
        </h2>
        <p>
          Your academic entries and uploaded content are stored securely across the following services:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cloud Firestore:</strong> Holds your deadlines, weekly timetable slots, exam schedules, calendar events, daily plans, and user preferences strictly at paths under <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border font-mono text-[11px]">users/{"{uid}"}/...</code>.</li>
          <li><strong>Firebase Storage:</strong> Stores uploaded academic notices, timetable circulars, and date sheet images or PDFs under <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border font-mono text-[11px]">users/{"{uid}"}/sources/...</code>.</li>
        </ul>
        <p>
          Access controls in Cloud Firestore and Firebase Storage strictly enforce that only the authenticated user matching <code className="font-mono text-[11px]">request.auth.uid == userId</code> can read or write these records. Unauthenticated access and cross-user data access are blocked at the database level.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          4. AI Processing (Google Gemini &amp; OpenRouter)
        </h2>
        <p>
          DeadlineIQ utilizes server-side artificial intelligence to automate academic document parsing and daily schedule generation:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>AI Extract (Deadlines):</strong> Parses user-pasted announcement text or uploaded notice images/PDFs to extract task titles, subjects, due dates, and priority weight.</li>
          <li><strong>AI Timetable Import:</strong> Parses uploaded class schedule images/PDFs or pasted text to extract recurring weekly class times, subjects, and classrooms.</li>
          <li><strong>AI Exam Import:</strong> Parses date sheets to extract exam dates, subject codes, and exam times.</li>
          <li><strong>Plan My Day:</strong> Processes your current local time, session length preferences, today's classes/exams, active deadlines, and enrolled subjects to generate a structured daily schedule.</li>
        </ul>
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
          <strong>Important AI Content Processing Notice:</strong> Text and uploaded attachments submitted to AI Extract, AI Import, or Plan My Day are transmitted securely server-side to <strong>Google Gemini API</strong> (and <strong>OpenRouter API</strong> as a secondary fallback) solely to execute the requested parsing task. Please do not submit confidential financial information, sensitive personal credentials, or content you do not want processed by these AI providers.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          5. Google Services &amp; Google Calendar Integration
        </h2>
        <p>
          DeadlineIQ integrates with Google services in two ways:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google Sign-In:</strong> Optional authentication provider managed via Firebase Authentication.</li>
          <li><strong>Google Calendar Integration:</strong> Optional feature utilizing OAuth 2.0 (<code className="font-mono text-[11px]">google.accounts.oauth2</code>) to synchronize events with your primary Google Calendar. OAuth access tokens are maintained strictly <strong>in-memory</strong> during active browser sessions and are never persisted in <code className="font-mono text-[11px]">localStorage</code>, cookies, or database servers.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          6. Third-Party Service Providers
        </h2>
        <p>
          The following third-party infrastructure providers receive or process data on behalf of DeadlineIQ:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google Firebase / Google Cloud Platform:</strong> Hosting, user authentication, Firestore database, and object storage.</li>
          <li><strong>Google Generative AI (Gemini API):</strong> Server-side document extraction and contextual schedule generation.</li>
          <li><strong>OpenRouter API:</strong> Secondary server-side fallback provider for document extraction when Gemini is unavailable.</li>
          <li><strong>Google Workspace (Google Calendar API):</strong> Client-authorized event synchronization.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          7. Data Retention &amp; Account Deletion
        </h2>
        <p>
          You retain complete control over your data retention:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Individual Items:</strong> Deleting a deadline, exam, or timetable entry immediately removes it from local browser storage and Cloud Firestore.</li>
          <li><strong>Complete Account Deletion:</strong> Clicking "Delete Account" in Account Settings or submitting a request via our public <a href="/delete-account" className="text-primary hover:underline">Data Deletion Page</a> initiates an irreversible server-side cleanup. This permanently deletes your Firebase Authentication account, all Firestore documents/subcollections, all uploaded Storage files, and purges all local browser caches.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          8. User Rights &amp; Privacy Contact
        </h2>
        <p>
          You have the right to access, export, or delete your personal data at any time. For questions, data requests, or privacy inquiries, contact us at:
        </p>
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border font-mono text-xs space-y-1">
          <div>Privacy Contact: <a href="mailto:privacy@deadlineiq.app" className="text-primary hover:underline">privacy@deadlineiq.app</a></div>
          <div>Developer Contact: <a href="mailto:aaryanbabel@gmail.com" className="text-primary hover:underline">aaryanbabel@gmail.com</a></div>
        </div>
      </section>

      <section className="space-y-2 pt-2 text-slate-500 dark:text-text-muted text-xs">
        <div>Effective Date: October 3, 2026</div>
        <div>DeadlineIQ Version 1.0</div>
      </section>
    </LegalLayout>
  );
}
