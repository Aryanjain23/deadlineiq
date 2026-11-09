import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  KeyRound,
  CalendarDays,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface GoogleSetupDiagnostics {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  gmailConnected: boolean;
  gmailRefreshTokenStored: boolean;
  gmailLastSync: string | null;
  gmailLastError: string | null;
  calendarConnected: boolean;
  calendarRefreshTokenStored: boolean;
  calendarLastSync: string | null;
  calendarLastError: string | null;
}

interface GoogleSetupCheckCardProps {
  userUid: string;
}

export default function GoogleSetupCheckCard({ userUid }: GoogleSetupCheckCardProps) {
  const [diagnostics, setDiagnostics] = useState<GoogleSetupDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchCheck = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/google/oauth/setup-check?uid=${encodeURIComponent(userUid || "")}`);
      if (res.ok) {
        const data = await res.json();
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics);
        }
      }
    } catch (err) {
      console.warn("Setup check error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userUid]);

  useEffect(() => {
    fetchCheck();
  }, [fetchCheck]);

  const allConfigured = Boolean(
    diagnostics?.clientIdConfigured &&
    diagnostics?.clientSecretConfigured &&
    diagnostics?.redirectUriConfigured
  );

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs ${
            allConfigured
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
          }`}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Google Setup Check
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                allConfigured
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20"
              }`}>
                {allConfigured ? "Server Credentials Configured" : "Credentials Action Needed"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-text-muted mt-0.5">
              Live diagnostics of server environment variables and active OAuth refresh tokens.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={fetchCheck}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Re-run diagnostics"
          >
            <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
            <span>{isLoading ? "Checking..." : "Recheck"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-[11px] transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>{isExpanded ? "Hide Details" : "Show Details"}</span>
            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* Grid of Diagnostic Items */}
      {diagnostics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 1. Client ID */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <KeyRound size={12} className="text-blue-500" />
                <span>GOOGLE_CLIENT_ID</span>
              </span>
              {diagnostics.clientIdConfigured ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Present
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400">
                  <AlertCircle size={11} /> Missing
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              {diagnostics.clientIdConfigured
                ? "OAuth Client ID is detected and active on the server."
                : "Add GOOGLE_CLIENT_ID to your .env or Vercel Environment Variables."}
            </p>
          </div>

          {/* 2. Client Secret */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <KeyRound size={12} className="text-purple-500" />
                <span>GOOGLE_CLIENT_SECRET</span>
              </span>
              {diagnostics.clientSecretConfigured ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Present
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400">
                  <AlertCircle size={11} /> Missing
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              {diagnostics.clientSecretConfigured
                ? "Client Secret is securely stored on the server."
                : "Add GOOGLE_CLIENT_SECRET to .env or Vercel (from Google Cloud Console -> Credentials)."}
            </p>
          </div>

          {/* 3. Redirect URI */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <ExternalLink size={12} className="text-indigo-500" />
                <span>REDIRECT_URI</span>
              </span>
              {diagnostics.redirectUriConfigured ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-rose-600 dark:text-rose-400">
                  <AlertCircle size={11} /> Missing
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              {diagnostics.redirectUriConfigured
                ? "Configured for GIS popup mode ('postmessage')."
                : "Add 'postmessage' to Authorized Redirect URIs in Google Cloud Console."}
            </p>
          </div>

          {/* 4. Gmail Connection & Refresh Token */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <Mail size={12} className="text-rose-500" />
                <span>Gmail Connection</span>
              </span>
              {diagnostics.gmailConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> {diagnostics.gmailRefreshTokenStored ? "Token Active" : "Connected"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-400">
                  Disconnected
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              {diagnostics.gmailConnected
                ? `Sync active. ${diagnostics.gmailLastSync ? `Last: ${new Date(diagnostics.gmailLastSync).toLocaleDateString()}` : ""}`
                : "Click 'Connect Gmail' below to link your academic inbox."}
            </p>
            {diagnostics.gmailLastError && (
              <p className="text-[10px] text-rose-500 font-mono mt-1 leading-tight">
                Notice: {diagnostics.gmailLastError}
              </p>
            )}
          </div>

          {/* 5. Google Calendar Connection & Refresh Token */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <CalendarDays size={12} className="text-blue-500" />
                <span>Calendar Connection</span>
              </span>
              {diagnostics.calendarConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> {diagnostics.calendarRefreshTokenStored ? "Token Active" : "Connected"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-400">
                  Disconnected
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              {diagnostics.calendarConnected
                ? `Sync active. ${diagnostics.calendarLastSync ? `Last: ${new Date(diagnostics.calendarLastSync).toLocaleDateString()}` : ""}`
                : "Click 'Connect' on the Google Calendar card below to sync."}
            </p>
            {diagnostics.calendarLastError && (
              <p className="text-[10px] text-rose-500 font-mono mt-1 leading-tight">
                Notice: {diagnostics.calendarLastError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Expandable Guide for Environment Variables */}
      {isExpanded && (
        <div className="mt-2 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0a0e17] text-xs space-y-2 text-slate-700 dark:text-slate-300">
          <div className="font-semibold text-slate-900 dark:text-white">Where to configure environment variables:</div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-text-secondary">
            <li>
              <strong>Google Cloud Console:</strong> Open <em>APIs &amp; Services &rarr; Credentials</em>, click your Web OAuth 2.0 Client, copy the <em>Client ID</em> and <em>Client Secret</em>, and ensure <code>postmessage</code> is in <em>Authorized redirect URIs</em>.
            </li>
            <li>
              <strong>Vercel (Production):</strong> In your project dashboard, open <em>Settings &rarr; Environment Variables</em>, and add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.
            </li>
            <li>
              <strong>Local Development:</strong> Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in your root <code>.env</code> file.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
