import { useState } from "react";
import LegalLayout from "@/components/LegalLayout";
import { Mail, MessageSquare, Shield, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !message) return;
    setSubmitted(true);
  };

  return (
    <LegalLayout
      title="Contact & Privacy Support"
      subtitle="Get in touch with the DeadlineIQ team for support, privacy inquiries, or data requests."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Direct Contacts */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
            Direct Contacts
          </h2>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield size={16} />
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">Privacy &amp; Data Inquiries</div>
                <p className="text-[11px] text-slate-600 dark:text-text-secondary mt-0.5">For data subject requests, access rights, or policy questions.</p>
                <a href="mailto:privacy@deadlineiq.app" className="text-xs font-mono text-primary hover:underline mt-1 inline-block">
                  privacy@deadlineiq.app
                </a>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail size={16} />
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">Account Deletion Requests</div>
                <p className="text-[11px] text-slate-600 dark:text-text-secondary mt-0.5">Manual account deletion for uninstalled app users.</p>
                <a href="mailto:deletion@deadlineiq.app" className="text-xs font-mono text-rose-600 dark:text-rose-400 hover:underline mt-1 inline-block">
                  deletion@deadlineiq.app
                </a>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageSquare size={16} />
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900 dark:text-white">Student Support</div>
                <p className="text-[11px] text-slate-600 dark:text-text-secondary mt-0.5">General assistance, bug reports, and timetable sync help.</p>
                <a href="mailto:support@deadlineiq.app" className="text-xs font-mono text-primary hover:underline mt-1 inline-block">
                  support@deadlineiq.app
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Contact Form */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white font-['Space_Grotesk'] border-b border-slate-200 dark:border-border pb-2">
            Send a Message
          </h2>

          {submitted ? (
            <div className="p-5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 size={18} />
                <span>Message Received</span>
              </div>
              <p className="leading-relaxed">
                Thank you for contacting DeadlineIQ support. We have received your inquiry and will respond to {email} shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-slate-100 dark:bg-surface border border-slate-200 dark:border-border space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-600 dark:text-text-secondary mb-1">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-border bg-white dark:bg-black/40 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 dark:text-text-secondary mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-border bg-white dark:bg-black/40 px-3.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 dark:text-text-secondary mb-1">Inquiry Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-border bg-white dark:bg-black/40 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-primary font-mono"
                >
                  <option value="general font-mono">General Support</option>
                  <option value="privacy">Privacy &amp; Data Access</option>
                  <option value="deletion">Account Deletion Request</option>
                  <option value="bug">Bug Report / Technical</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-600 dark:text-text-secondary mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  placeholder="How can we help you?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-border bg-white dark:bg-black/40 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition-all cursor-pointer shadow-xs"
              >
                Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </LegalLayout>
  );
}
