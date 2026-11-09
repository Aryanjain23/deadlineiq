import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Edit3,
  CheckSquare,
  Square,
  UserCheck,
  UserX,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { createDeadline } from "@/lib/services/deadlineService";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import {
  getGmailMeta,
  saveGmailMeta,
  type GmailMeta,
} from "@/lib/gmail";
import {
  getReviewInbox,
  saveReviewInbox,
  syncGmailWithReviewFlow,
  setSenderRule,
  getSenderRules,
  type GmailReviewItem,
  type SenderRules,
} from "@/lib/gmailReview";

interface GmailReviewSettingsSectionProps {
  userUid: string;
}

export default function GmailReviewSettingsSection({ userUid }: GmailReviewSettingsSectionProps) {
  const [meta, setMeta] = useState<GmailMeta>(() => getGmailMeta(userUid));
  const [items, setItems] = useState<GmailReviewItem[]>([]);
  const [senderRules, setSenderRules] = useState<SenderRules>({ trustedSenders: [], blockedSenders: [] });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatsText, setSyncStatsText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Toggles
  const [showIgnored, setShowIgnored] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Row Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("23:59");
  const [editCourse, setEditCourse] = useState("");
  const [editType, setEditType] = useState<"assignment" | "exam" | "quiz" | "project" | "other">("assignment");

  useEffect(() => {
    if (!userUid) return;
    setMeta(getGmailMeta(userUid));
    setItems(getReviewInbox(userUid));
    setSenderRules(getSenderRules(userUid));
  }, [userUid]);

  const handleToggleConnection = async () => {
    if (!userUid) return;
    if (meta.isConnected) {
      setIsSyncing(true);
      try {
        const { disconnectGmail } = await import("@/lib/gmail");
        await disconnectGmail(userUid);
        setMeta(getGmailMeta(userUid));
        setSyncStatsText("Gmail disconnected.");
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to disconnect Gmail.");
      } finally {
        setIsSyncing(false);
      }
    } else {
      setIsSyncing(true);
      setErrorMessage(null);
      try {
        const { requestUnifiedGoogleAccess } = await import("@/lib/googleAuth");
        const res = await requestUnifiedGoogleAccess(userUid);
        setMeta(getGmailMeta(userUid));
        setSyncStatsText(`Connected as ${res.connectedEmail || "Gmail Account"}`);
        // Run initial sync
        const stats = await syncGmailWithReviewFlow(userUid, false);
        setItems(getReviewInbox(userUid));
        setSyncStatsText(stats.feedback);
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to connect Gmail.");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleSyncNow = async () => {
    if (!userUid) return;
    setIsSyncing(true);
    setErrorMessage(null);
    setSyncStatsText(null);
    try {
      const stats = await syncGmailWithReviewFlow(userUid, false);
      setMeta(getGmailMeta(userUid));
      setItems(getReviewInbox(userUid));
      setSyncStatsText(stats.feedback);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gmail sync failed. Click Connect to re-authorize.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Selection Shortcuts
  const handleSelectAll = (candidates: GmailReviewItem[]) => {
    setSelectedIds(new Set(candidates.map((i) => i.id)));
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
  };

  const handleSelectHighConfidenceOnly = (candidates: GmailReviewItem[]) => {
    const highConf = candidates
      .filter((i) => i.verdict === "relevant" && i.confidence >= 0.85)
      .map((i) => i.id);
    setSelectedIds(new Set(highConf));
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Expand Row for Editing
  const toggleExpandRow = (item: GmailReviewItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
    } else {
      setExpandedId(item.id);
      setEditTitle(item.extracted.title || item.subject);
      setEditDueDate(item.extracted.dueDate || "");
      setEditDueTime(item.extracted.dueTime || "23:59");
      setEditCourse(item.extracted.course || item.course || "");
      setEditType(item.extracted.type || "assignment");
    }
  };

  // Save inline edit to row
  const handleSaveInlineEdit = (item: GmailReviewItem) => {
    const updatedExtracted = {
      ...item.extracted,
      title: editTitle.trim() || item.subject,
      dueDate: editDueDate || null,
      dueTime: editDueTime || "23:59",
      course: editCourse.trim() || null,
      type: editType,
      needsDate: !editDueDate,
    };

    const updatedList = items.map((i) =>
      i.id === item.id ? { ...i, extracted: updatedExtracted } : i
    );
    setItems(updatedList);
    saveReviewInbox(userUid, updatedList);
    setExpandedId(null);
  };

  // Add single item
  const handleAddSingle = async (item: GmailReviewItem) => {
    if (!userUid) return;
    if (item.extracted.needsDate || !item.extracted.dueDate) {
      setErrorMessage(`Cannot add "${item.extracted.title}": Due Date is required. Expand row to add a date.`);
      return;
    }

    try {
      const deadlinePayload: Deadline = {
        id: `gmail_${item.id}`,
        taskName: item.extracted.title || item.subject,
        subject: item.extracted.course || item.course || "Academic Email",
        description: `${item.extracted.notes || item.reason}\n\nSender: ${item.sender}\nReceived: ${item.dateReceived}`,
        dueDate: item.extracted.dueDate,
        dueTime: item.extracted.dueTime || "23:59",
        importance: item.confidence >= 0.85 ? "HIGH" : "MEDIUM",
        completed: false,
        createdAt: new Date().toISOString(),
        source: "ai",
        sourceType: "imported",
        sourceId: item.id,
        dateSource: "ai-extracted",
        confidence: item.confidence >= 0.85 ? "HIGH" : "MEDIUM",
      };

      await createDeadline(userUid, deadlinePayload);

      const updatedList = items.map((i) => (i.id === item.id ? { ...i, status: "added" as const } : i));
      setItems(updatedList);
      saveReviewInbox(userUid, updatedList);

      const nextSel = new Set(selectedIds);
      nextSel.delete(item.id);
      setSelectedIds(nextSel);
      setSyncStatsText(`Added "${deadlinePayload.taskName}" to your deadlines!`);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to save deadline.");
    }
  };

  // Primary Action: Extract & add selected (N)
  const handleAddSelected = async (candidates: GmailReviewItem[]) => {
    const selectedItems = candidates.filter((i) => selectedIds.has(i.id) && i.status === "pending");
    if (selectedItems.length === 0) return;

    // Validate if any checked item is missing date
    const missingDateItem = selectedItems.find((i) => i.extracted.needsDate || !i.extracted.dueDate);
    if (missingDateItem) {
      setErrorMessage(
        `Cannot add "${missingDateItem.extracted.title}": Due date is required. Please expand row and set a date.`
      );
      return;
    }

    let count = 0;
    for (const item of selectedItems) {
      try {
        await handleAddSingle(item);
        count++;
      } catch {}
    }
    setSyncStatsText(`Successfully added ${count} task(s) to your deadlines!`);
  };

  // Secondary Action: Dismiss selected
  const handleDismissSelected = (candidates: GmailReviewItem[]) => {
    const toDismissIds = candidates.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    if (toDismissIds.length === 0) return;

    const updatedList = items.map((i) =>
      toDismissIds.includes(i.id) ? { ...i, status: "dismissed" as const } : i
    );
    setItems(updatedList);
    saveReviewInbox(userUid, updatedList);

    const nextSel = new Set(selectedIds);
    toDismissIds.forEach((id) => nextSel.delete(id));
    setSelectedIds(nextSel);

    setSyncStatsText(`Dismissed ${toDismissIds.length} email notice(s).`);
  };

  // Sender trust / block
  const handleRuleChange = (senderEmail: string, action: "trust" | "block") => {
    if (!userUid || !senderEmail) return;
    const updated = setSenderRule(userUid, senderEmail, action);
    setSenderRules(updated);
    setSyncStatsText(
      action === "trust" ? `Always trusting ${senderEmail}` : `Never showing ${senderEmail}`
    );
  };

  // Filter pending items
  const pendingCandidates = useMemo(() => {
    return items.filter((i) => {
      if (i.status !== "pending") return false;
      if (!showIgnored && i.verdict === "ignore") return false;
      return true;
    });
  }, [items, showIgnored]);

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white dark:bg-surface/90 backdrop-blur-md p-6 sm:p-8 shadow-xs space-y-6">
      {/* 1. Header & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200/80 dark:border-border pb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center flex-shrink-0 shadow-xs">
            <Mail size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Gmail Task Sync &amp; Review
              </h3>
              {meta.isConnected ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  Connected
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400">
                  Disconnected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-text-secondary mt-1">
              {meta.isConnected
                ? `Connected as ${meta.connectedEmail || "Gmail Account"}.`
                : "Connect Gmail to automatically triage assignment notices & course deadlines."}
            </p>
            {meta.lastSyncTime && (
              <p className="text-[11px] font-mono text-slate-400 dark:text-text-muted mt-0.5">
                Last synced: {new Date(meta.lastSyncTime).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {meta.isConnected && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Scanning..." : "Sync Now"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleConnection}
            disabled={isSyncing}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              meta.isConnected
                ? "border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                : "bg-rose-600 hover:bg-rose-500 text-white shadow-xs"
            }`}
          >
            {meta.isConnected ? "Disconnect Gmail" : "Connect Gmail"}
          </button>
        </div>
      </div>

      {/* Feedback Banners */}
      <AnimatePresence>
        {syncStatsText && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-500" />
              <span>{syncStatsText}</span>
            </div>
            <button type="button" onClick={() => setSyncStatsText(null)} className="cursor-pointer text-emerald-600">
              <X size={14} />
            </button>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
            <button type="button" onClick={() => setErrorMessage(null)} className="cursor-pointer text-rose-500">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy Banner */}
      <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 text-[11px] text-blue-900 dark:text-blue-200 flex items-center gap-2">
        <Info size={14} className="text-blue-500 flex-shrink-0" />
        <span>DeadlineIQ only reads message subject lines &amp; content to find assignment deadlines. We never auto-send or delete your emails.</span>
      </div>

      {/* 2. Selection & Shortcuts Toolbar */}
      {meta.isConnected && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-[#0c101a] p-3 rounded-xl border border-slate-200/80 dark:border-border">
            {/* Selection Shortcuts */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-mono text-[11px] text-slate-500 dark:text-text-muted">Select:</span>
              <button
                type="button"
                onClick={() => handleSelectAll(pendingCandidates)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                All ({pendingCandidates.length})
              </button>
              <button
                type="button"
                onClick={handleSelectNone}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                None
              </button>
              <button
                type="button"
                onClick={() => handleSelectHighConfidenceOnly(pendingCandidates)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-medium transition-colors cursor-pointer"
              >
                High Confidence Only (≥85%)
              </button>

              <label className="flex items-center gap-1.5 ml-auto text-[11px] text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showIgnored}
                  onChange={(e) => setShowIgnored(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-0 accent-rose-600"
                />
                <span>Show ignored emails</span>
              </label>
            </div>

            {/* Primary & Secondary Bulk Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleAddSelected(pendingCandidates)}
                disabled={selectedIds.size === 0}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check size={13} />
                <span>Extract &amp; add selected ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => handleDismissSelected(pendingCandidates)}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Dismiss selected
              </button>
            </div>
          </div>

          {/* 3. Candidate Emails List */}
          {pendingCandidates.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/50 dark:bg-[#0c101a] rounded-xl border border-dashed border-slate-200 dark:border-border p-6">
              <Mail size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Nothing to review</h4>
              <p className="text-xs text-slate-500 dark:text-text-secondary mt-1">
                Your Gmail inbox is up to date. Click <strong>Sync Now</strong> above to scan for new notices.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCandidates.map((item) => {
                const isChecked = selectedIds.has(item.id);
                const isExpanded = expandedId === item.id;
                const needsDate = item.extracted.needsDate || !item.extracted.dueDate;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-all bg-slate-50/40 dark:bg-[#0c101a] ${
                      isChecked
                        ? "border-blue-500/50 ring-1 ring-blue-500/20"
                        : "border-slate-200 dark:border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Selection Checkbox & Main Info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSelectRow(item.id)}
                          className="mt-0.5 text-slate-400 hover:text-blue-500 cursor-pointer flex-shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare size={17} className="text-blue-500" />
                          ) : (
                            <Square size={17} />
                          )}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Subject & Badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {item.subject}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                                item.verdict === "relevant"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                  : item.verdict === "maybe"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                  : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {item.verdict === "relevant" ? "Relevant" : item.verdict === "maybe" ? "Maybe" : "Ignored"}
                            </span>

                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-surface-elevated">
                              {Math.round(item.confidence * 100)}% conf
                            </span>

                            {needsDate && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                                <AlertCircle size={10} /> Needs date
                              </span>
                            )}
                          </div>

                          {/* Sender & Date */}
                          <div className="flex items-center gap-2.5 text-[11px] text-slate-500 dark:text-text-secondary flex-wrap">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{item.sender}</span>
                            <span>•</span>
                            <span>{new Date(item.dateReceived).toLocaleDateString()}</span>
                            <a
                              href={item.sourceLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 hover:underline flex items-center gap-1 text-[10px]"
                            >
                              <span>Open Email</span>
                              <ExternalLink size={9} />
                            </a>
                          </div>

                          {/* Reason */}
                          <p className="text-[11px] text-slate-600 dark:text-text-muted">
                            <strong className="text-slate-800 dark:text-slate-200">AI Reason: </strong>
                            {item.reason}
                          </p>

                          {/* Preview Card Summary */}
                          <div className="p-2.5 rounded-lg border border-slate-200/80 dark:border-white/5 bg-white dark:bg-surface text-[11px] grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <span className="text-[9px] font-mono uppercase text-slate-400">Title</span>
                              <div className="font-medium text-slate-900 dark:text-white truncate">
                                {item.extracted.title}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] font-mono uppercase text-slate-400">Due Date &amp; Time</span>
                              <div className="font-medium text-slate-900 dark:text-white">
                                {item.extracted.dueDate ? (
                                  <span>{item.extracted.dueDate} at {item.extracted.dueTime || "23:59"}</span>
                                ) : (
                                  <span className="text-rose-500 font-semibold">Needs date</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="text-[9px] font-mono uppercase text-slate-400">Course / Type</span>
                              <div className="font-medium text-slate-900 dark:text-white capitalize">
                                {item.extracted.course || item.course || "General"} ({item.extracted.type})
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row Action Buttons */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddSingle(item)}
                          disabled={needsDate}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                          title={needsDate ? "Set a due date first" : "Add deadline"}
                        >
                          <Check size={12} />
                          <span>Add</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleExpandRow(item)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-border text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-elevated transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 size={11} />
                          <span>{isExpanded ? "Close" : "Edit"}</span>
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>

                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => handleRuleChange(item.senderEmail, "trust")}
                            className="p-1 text-slate-400 hover:text-emerald-500 text-[10px] cursor-pointer"
                            title="Always trust sender"
                          >
                            <UserCheck size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRuleChange(item.senderEmail, "block")}
                            className="p-1 text-slate-400 hover:text-rose-500 text-[10px] cursor-pointer"
                            title="Never show sender"
                          >
                            <UserX size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Editor Panel */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 space-y-3 text-xs bg-white dark:bg-surface p-3 rounded-lg">
                        <div className="font-semibold text-slate-900 dark:text-white">Edit Extracted Fields:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Task Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Course / Subject</label>
                            <input
                              type="text"
                              value={editCourse}
                              onChange={(e) => setEditCourse(e.target.value)}
                              placeholder="e.g. CS101"
                              className="w-full rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Due Date (Required)</label>
                            <input
                              type="date"
                              value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Due Time</label>
                            <input
                              type="time"
                              value={editDueTime}
                              onChange={(e) => setEditDueTime(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            className="px-3 py-1 rounded-lg border border-slate-200 dark:border-border text-xs text-slate-600 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveInlineEdit(item)}
                            className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                          >
                            Save Fields
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
