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
  Play,
  Copy,
  Check,
} from "lucide-react";
import { testGoogleConnection } from "@/lib/googleAuth";

export interface GoogleSetupDiagnostics {
  clientIdConfigured: boolean;
  clientIdPrefix: string;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  redirectUri: string;
  gmailConnected: boolean;
  gmailScopeGranted: boolean;
  gmailRefreshTokenStored: boolean;
  gmailLastSync: string | null;
  gmailLastError: string | null;
  gmailLastErrorCode: string | null;
  calendarConnected: boolean;
  calendarScopeGranted: boolean;
  calendarRefreshTokenStored: boolean;
  calendarLastSync: string | null;
  calendarLastError: string | null;
  calendarLastErrorCode: string | null;
}

interface GoogleSetupCheckCardProps {
  userUid: string;
}

interface TestResult {
  testing: boolean;
  success?: boolean;
  message?: string;
  errorCode?: string;
}

export default function GoogleSetupCheckCard({ userUid }: GoogleSetupCheckCardProps) {
  const [diagnostics, setDiagnostics] = useState<GoogleSetupDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [gmailTest, setGmailTest] = useState<TestResult>({ testing: false });
  const [calendarTest, setCalendarTest] = useState<TestResult>({ testing: false });

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

  const handleTestGmail = async () => {
    setGmailTest({ testing: true });
    try {
      const res = await testGoogleConnection(userUid, "gmail");
      setGmailTest({
        testing: false,
        success: res.success,
        message: res.message || res.error || (res.success ? "Connection passed!" : "Connection failed"),
        errorCode: res.errorCode,
      });
      fetchCheck();
    } catch (err: any) {
      setGmailTest({
        testing: false,
        success: false,
        message: err?.message || "Failed to test connection",
        errorCode: "client_error",
      });
    }
  };

  const handleTestCalendar = async () => {
    setCalendarTest({ testing: true });
    try {
      const res = await testGoogleConnection(userUid, "calendar");
      setCalendarTest({
        testing: false,
        success: res.success,
        message: res.message || res.error || (res.success ? "Connection passed!" : "Connection failed"),
        errorCode: res.errorCode,
      });
      fetchCheck();
    } catch (err: any) {
      setCalendarTest({
        testing: false,
        success: false,
        message: err?.message || "Failed to test connection",
        errorCode: "client_error",
      });
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const allConfigured = Boolean(
    diagnostics?.clientIdConfigured &&
    diagnostics?.clientSecretConfigured &&
    diagnostics?.redirectUriConfigured
  );

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const serverRedirect = diagnostics?.redirectUri || `${currentOrigin}/api/auth/google/callback`;

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
                Google Setup Check &amp; Diagnostics
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
              Live diagnostics of server credentials, exact redirect URIs, granted scopes, and active OAuth refresh tokens.
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
            <span>{isExpanded ? "Hide Console URIs" : "Cloud Console URIs"}</span>
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
                ? `Active on server (Prefix: ${diagnostics.clientIdPrefix})`
                : "Missing on server. Add GOOGLE_CLIENT_ID in your environment variables."}
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
                ? "Client Secret is securely loaded on the server (never exposed to browser)."
                : "Missing on server. Add GOOGLE_CLIENT_SECRET to enable OAuth code exchange."}
            </p>
          </div>

          {/* 3. Redirect URI */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <ExternalLink size={12} className="text-indigo-500" />
                <span>REDIRECT_URI</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={11} /> Server-Driven
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-600 dark:text-text-muted truncate" title={serverRedirect}>
              {serverRedirect}
            </p>
          </div>

          {/* 4. Gmail Connection & Scope */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <Mail size={12} className="text-rose-500" />
                <span>Gmail (gmail.readonly)</span>
              </span>
              {diagnostics.gmailConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Connected
                </span>
              ) : diagnostics.gmailRefreshTokenStored ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle size={11} /> Scope Missing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-400">
                  Not Connected
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 dark:text-text-muted space-y-1">
              <div>Refresh Token: {diagnostics.gmailRefreshTokenStored ? "Stored" : "Not Stored"}</div>
              <div>Scope Granted: {diagnostics.gmailScopeGranted ? "Yes" : "No"}</div>
              {diagnostics.gmailLastError && (
                <div className="text-[10px] text-rose-500 font-mono leading-tight">
                  Last error: {diagnostics.gmailLastError} {diagnostics.gmailLastErrorCode ? `(${diagnostics.gmailLastErrorCode})` : ""}
                </div>
              )}
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestGmail}
                disabled={gmailTest.testing}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {gmailTest.testing ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                <span>{gmailTest.testing ? "Testing Gmail API..." : "Test Gmail Connection"}</span>
              </button>

              {gmailTest.message && (
                <div className={`mt-1.5 p-2 rounded-lg text-[10px] font-mono border ${
                  gmailTest.success
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                }`}>
                  <div className="font-semibold">{gmailTest.success ? "PASS: " : "FAIL: "}</div>
                  <div className="break-words mt-0.5">{gmailTest.message}</div>
                </div>
              )}
            </div>
          </div>

          {/* 5. Calendar Connection & Scope */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 flex items-center gap-1.5">
                <CalendarDays size={12} className="text-blue-500" />
                <span>Calendar (calendar.events)</span>
              </span>
              {diagnostics.calendarConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={11} /> Connected
                </span>
              ) : diagnostics.calendarRefreshTokenStored ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-amber-600 dark:text-amber-400">
                  <AlertCircle size={11} /> Scope Missing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-slate-400">
                  Not Connected
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-600 dark:text-text-muted space-y-1">
              <div>Refresh Token: {diagnostics.calendarRefreshTokenStored ? "Stored" : "Not Stored"}</div>
              <div>Scope Granted: {diagnostics.calendarScopeGranted ? "Yes" : "No"}</div>
              {diagnostics.calendarLastError && (
                <div className="text-[10px] text-rose-500 font-mono leading-tight">
                  Last error: {diagnostics.calendarLastError} {diagnostics.calendarLastErrorCode ? `(${diagnostics.calendarLastErrorCode})` : ""}
                </div>
              )}
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestCalendar}
                disabled={calendarTest.testing}
                className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {calendarTest.testing ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                <span>{calendarTest.testing ? "Testing Calendar API..." : "Test Calendar Connection"}</span>
              </button>

              {calendarTest.message && (
                <div className={`mt-1.5 p-2 rounded-lg text-[10px] font-mono border ${
                  calendarTest.success
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                }`}>
                  <div className="font-semibold">{calendarTest.success ? "PASS: " : "FAIL: "}</div>
                  <div className="break-words mt-0.5">{calendarTest.message}</div>
                </div>
              )}
            </div>
          </div>

          {/* 6. Architecture & Client ID Summary */}
          <div className="p-3 rounded-xl border border-slate-200/80 dark:border-border bg-slate-50/50 dark:bg-[#0c101a] space-y-1.5">
            <span className="text-[10px] font-mono font-medium uppercase text-slate-500 block">
              OAuth Architecture Note
            </span>
            <p className="text-[11px] text-slate-600 dark:text-text-muted leading-relaxed">
              The app now uses a standard, server-driven OAuth authorization code flow. All code exchanges, token refreshes, and API calls occur securely with Google without relying on browser client secrets or fragile popup GIS postmessage URIs.
            </p>
            <div className="text-[10px] text-slate-500 dark:text-text-secondary pt-1 font-mono">
              VITE_GOOGLE_CLIENT_ID is no longer required in frontend bundles.
            </div>
          </div>
        </div>
      )}

      {/* Expandable Cloud Console Registration Guide */}
      {isExpanded && (
        <div className="mt-2 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0a0e17] text-xs space-y-3 text-slate-700 dark:text-slate-300">
          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Google Cloud Console &rarr; OAuth 2.0 Web Client Settings:</span>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              1. Authorized Redirect URIs (Add all applicable):
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                serverRedirect,
                "https://ais-dev-5i2y3ydg42ln5w5p7rz3tq-481438866745.asia-southeast1.run.app/api/auth/google/callback",
                "https://ais-pre-5i2y3ydg42ln5w5p7rz3tq-481438866745.asia-southeast1.run.app/api/auth/google/callback",
                "http://localhost:3000/api/auth/google/callback",
              ].filter((uri, idx, arr) => arr.indexOf(uri) === idx).map((uri, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-surface border border-slate-200 dark:border-border">
                  <span className="truncate mr-2 text-slate-800 dark:text-slate-200">{uri}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(uri, `uri_${idx}`)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title="Copy URI"
                  >
                    {copiedKey === `uri_${idx}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              2. Authorized JavaScript Origins:
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                currentOrigin,
                "https://ais-dev-5i2y3ydg42ln5w5p7rz3tq-481438866745.asia-southeast1.run.app",
                "https://ais-pre-5i2y3ydg42ln5w5p7rz3tq-481438866745.asia-southeast1.run.app",
                "http://localhost:3000",
              ].filter(Boolean).filter((origin, idx, arr) => arr.indexOf(origin) === idx).map((origin, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-surface border border-slate-200 dark:border-border">
                  <span className="truncate mr-2 text-slate-800 dark:text-slate-200">{origin}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(origin, `origin_${idx}`)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title="Copy Origin"
                  >
                    {copiedKey === `origin_${idx}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
