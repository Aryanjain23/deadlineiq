import LegalLayout from "@/components/LegalLayout";

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      title="Cookie & Storage Policy"
      subtitle="Detailed information about local browser storage, session persistence, and tracking."
    >
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          1. Overview: Zero Analytics &amp; Zero Tracking Cookies
        </h2>
        <p>
          DeadlineIQ does <strong>not</strong> use HTTP cookies for user tracking, behavioral profiling, or third-party advertising.
        </p>
        <p>
          We do not operate Google Analytics, Facebook Pixels, marketing cookies, or cross-site tracking scripts. You will not find advertising walls or tracking banners in DeadlineIQ because no ad-tracking code exists in our application.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          2. Local Storage (<code className="font-mono text-xs">localStorage</code>)
        </h2>
        <p>
          DeadlineIQ uses web browser <code className="font-mono text-xs">localStorage</code> exclusively for client-side app functionality, theme preferences, and fast offline cache rendering.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 dark:border-border rounded-lg overflow-hidden">
            <thead className="bg-slate-100 dark:bg-surface border-b border-slate-200 dark:border-border font-mono text-slate-700 dark:text-text-secondary">
              <tr>
                <th className="p-2.5">Key Prefix</th>
                <th className="p-2.5">Purpose</th>
                <th className="p-2.5">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-border/60">
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_session</td>
                <td className="p-2.5">Maintains active user session state across page reloads.</td>
                <td className="p-2.5">Functional</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_deadlines_*</td>
                <td className="p-2.5">Offline local cache for assignment deadlines to allow instant rendering.</td>
                <td className="p-2.5">Functional Cache</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_timetable_*</td>
                <td className="p-2.5">Offline local cache for weekly class schedules.</td>
                <td className="p-2.5">Functional Cache</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_exams_*</td>
                <td className="p-2.5">Offline local cache for exam date sheets.</td>
                <td className="p-2.5">Functional Cache</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_events_*</td>
                <td className="p-2.5">Offline local cache for personal and academic calendar events.</td>
                <td className="p-2.5">Functional Cache</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_plan_*</td>
                <td className="p-2.5">Offline local cache for saved daily planner schedules.</td>
                <td className="p-2.5">Functional Cache</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">deadlineiq_gcal_meta_*</td>
                <td className="p-2.5">Non-sensitive connection flags for Google Calendar (connected email, selected calendar IDs, sync timestamp).</td>
                <td className="p-2.5">Functional Meta</td>
              </tr>
              <tr>
                <td className="p-2.5 font-mono">theme</td>
                <td className="p-2.5">Remembers UI dark or light mode theme preference.</td>
                <td className="p-2.5">Preference</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          3. OAuth Access Token Security
        </h2>
        <p>
          Google Calendar OAuth access tokens are <strong>never</strong> persisted in <code className="font-mono text-xs">localStorage</code>, cookies, or database servers. Tokens are maintained strictly in-memory during active application usage and expire automatically.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          4. Firebase Authentication &amp; IndexedDB
        </h2>
        <p>
          Firebase Authentication uses standard browser session mechanisms (<code className="font-mono text-xs">browserLocalPersistence</code>) and IndexedDB to keep you signed in securely.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
          5. Clearing Storage Data
        </h2>
        <p>
          You can clear DeadlineIQ local storage caches at any time by:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Clicking <strong>Log Out</strong> or <strong>Delete Account</strong> in Account Settings (which automatically purges all <code className="font-mono text-xs">deadlineiq_*</code> keys).</li>
          <li>Clearing browser site data in your web browser settings.</li>
        </ul>
      </section>

      <section className="space-y-2 pt-2 text-slate-500 dark:text-text-muted text-xs">
        <div>Effective Date: October 3, 2026</div>
        <div>Contact: <a href="mailto:privacy@deadlineiq.app" className="text-primary hover:underline">privacy@deadlineiq.app</a></div>
      </section>
    </LegalLayout>
  );
}
