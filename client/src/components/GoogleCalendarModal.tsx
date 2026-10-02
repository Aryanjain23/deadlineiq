import { useState } from "react";
import {
  X,
  Calendar,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Power,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import type {
  GoogleCalendarMeta,
  GoogleCalendarListItem,
  GoogleSyncStatus,
  GoogleCalendarError,
} from "@/lib/googleCalendar";

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  meta: GoogleCalendarMeta;
  syncStatus: GoogleSyncStatus;
  lastError: GoogleCalendarError | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onToggleCalendar: (calendarId: string) => void;
  isConfigured: boolean;
}

export default function GoogleCalendarModal({
  isOpen,
  onClose,
  meta,
  syncStatus,
  lastError,
  onConnect,
  onDisconnect,
  onSyncNow,
  onToggleCalendar,
  isConfigured,
}: GoogleCalendarModalProps) {
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  if (!isOpen) return null;

  const handleConnectClick = async () => {
    setIsActionPending(true);
    try {
      await onConnect();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDisconnectClick = async () => {
    setIsActionPending(true);
    try {
      await onDisconnect();
      setIsConfirmingDisconnect(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSyncClick = async () => {
    setIsActionPending(true);
    try {
      await onSyncNow();
    } finally {
      setIsActionPending(false);
    }
  };

  const isConnected = meta.isConnected;
  const isSyncing = syncStatus === "syncing" || isActionPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg my-auto rounded-3xl border border-border bg-surface-elevated backdrop-blur-3xl p-6 sm:p-7 shadow-2xl z-10 text-text-primary transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          <X size={15} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#4285F4]/20 to-[#34A853]/20 border border-[#4285F4]/30 flex items-center justify-center shadow-xs">
            {/* Google Calendar SVG Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4H19ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"
                fill="#4285F4"
              />
              <path d="M7 12H12V17H7V12Z" fill="#34A853" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif]">
              Google Calendar
            </h3>
            <p className="text-xs font-mono text-text-muted">
              Two-way synchronization with DeadlineIQ
            </p>
          </div>
        </div>

        {/* Connection Status Pill */}
        <div className="flex items-center justify-between py-3 px-4 rounded-2xl bg-surface border border-border my-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? syncStatus === "error" || syncStatus === "expired"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-slate-400"
              }`}
            />
            <div className="text-xs font-mono">
              <span className="text-text-muted">Status: </span>
              <span
                className={`font-semibold ${
                  isConnected
                    ? syncStatus === "error" || syncStatus === "expired"
                      ? "text-amber-500"
                      : "text-emerald-700 dark:text-[#a7f3d0]"
                    : "text-text-muted"
                }`}
              >
                {isConnected
                  ? syncStatus === "expired"
                    ? "Authorization Expired"
                    : "Connected"
                  : "Not Connected"}
              </span>
            </div>
          </div>

          {meta.lastSyncTime && isConnected && (
            <span className="text-[11px] font-mono text-text-muted">
              Synced {new Date(meta.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* Configuration Notice if OAuth Client ID Missing */}
        {!isConfigured && (
          <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200 text-xs mb-4 flex items-start gap-3 leading-relaxed">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">OAuth Client ID Not Configured</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-200/80 mt-0.5">
                Set <code className="bg-surface-subtle border border-border px-1 py-0.5 rounded font-mono">VITE_GOOGLE_CALENDAR_CLIENT_ID</code> in your environment to enable Google Calendar sync.
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Error Banner if failed */}
        {lastError && (
          <div className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200 text-xs mb-4 flex items-start gap-3 leading-relaxed">
            <AlertTriangle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-800 dark:text-rose-300">
                {lastError.type === "expired"
                  ? "Session Expired"
                  : lastError.type === "denied"
                  ? "Permission Denied"
                  : lastError.type === "network"
                  ? "Network Error"
                  : lastError.type === "quota"
                  ? "API Quota Limit"
                  : "Connection Error"}
              </p>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-200/80 mt-0.5">{lastError.message}</p>
            </div>
            {lastError.type === "expired" && (
              <button
                type="button"
                onClick={handleConnectClick}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-mono text-rose-800 dark:text-white transition-colors"
              >
                Reconnect
              </button>
            )}
          </div>
        )}

        {/* Main Body */}
        {isConnected ? (
          <div className="space-y-4">
            {/* Connected Controls: Sync Now & Calendars */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-xs font-mono text-text-secondary">
                <span>Active Google Calendars:</span>
              </div>
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-elevated text-xs font-mono text-[#0284c7] dark:text-[#76d8fb] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
              </button>
            </div>

            {/* List of User Calendars */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {meta.calendars.length === 0 ? (
                <div className="p-3 rounded-2xl border border-border bg-surface text-xs font-mono text-text-muted text-center">
                  Primary Google Calendar connected
                </div>
              ) : (
                meta.calendars.map((cal) => {
                  const isChecked = meta.selectedCalendarIds.includes(cal.id);
                  return (
                    <label
                      key={cal.id}
                      className="flex items-center justify-between p-3 rounded-2xl border border-border bg-surface hover:bg-surface-elevated transition-colors cursor-pointer text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cal.backgroundColor || "#4285F4" }}
                        />
                        <span className="font-medium text-text-primary truncate max-w-[240px]">
                          {cal.summary}
                        </span>
                        {cal.primary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-sky-500/15 text-sky-700 dark:text-[#bae6fd] border border-sky-500/30">
                            Primary
                          </span>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleCalendar(cal.id)}
                        className="rounded border-border bg-surface text-accent focus:ring-0 cursor-pointer"
                      />
                    </label>
                  );
                })
              )}
            </div>

            {/* How two-way sync works info */}
            <div className="p-3 rounded-2xl border border-border bg-surface text-xs text-text-secondary space-y-1.5 font-sans leading-relaxed">
              <div className="flex items-center gap-1.5 text-text-primary font-medium text-[11px] font-mono">
                <Sparkles size={12} className="text-[#0284c7] dark:text-[#76d8fb]" />
                <span>Two-Way Sync Enabled</span>
              </div>
              <p className="text-[11px]">
                Events created in Google Calendar appear on your DeadlineIQ timeline. You can also send DeadlineIQ events directly to Google Calendar by selecting <strong>"Add to Google Calendar"</strong> when creating an event.
              </p>
            </div>

            {/* Disconnect Area */}
            <div className="pt-2 border-t border-border">
              {isConfirmingDisconnect ? (
                <div className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 space-y-2.5">
                  <p className="text-xs text-rose-700 dark:text-rose-200">
                    Disconnect Google Calendar? Your existing DeadlineIQ deadlines and native events will <strong>NOT</strong> be deleted.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDisconnectClick}
                      disabled={isActionPending}
                      className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-mono font-medium transition-colors cursor-pointer"
                    >
                      Confirm Disconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDisconnect(false)}
                      className="px-3 py-1.5 rounded-xl border border-border text-xs font-mono text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDisconnect(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <Power size={13} />
                    <span>Disconnect Google Calendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-border bg-surface text-xs font-mono text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shadow-xs"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Disconnected State */
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-2xl border border-border bg-surface text-xs text-text-secondary space-y-2 leading-relaxed">
              <p className="text-text-primary font-medium">Why connect Google Calendar?</p>
              <ul className="space-y-1.5 list-disc list-inside text-text-muted">
                <li>View your Google Calendar events alongside academic deadlines and timetable.</li>
                <li>Prevent scheduling conflicts before assignments are due.</li>
                <li>Optionally push new DeadlineIQ events straight into your Google Calendar.</li>
                <li>Google passwords and secrets are never stored.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-xs font-mono text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConnectClick}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#4285F4]/40 bg-gradient-to-r from-[#4285F4] to-[#2b72e5] hover:brightness-110 text-white font-medium text-xs font-mono shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {/* Google "G" Icon */}
                <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>{isSyncing ? "Connecting..." : "Connect Google Calendar"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
