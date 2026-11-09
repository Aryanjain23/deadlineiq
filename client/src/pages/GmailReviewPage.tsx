import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Edit3,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Sliders,
  Info,
  Calendar,
  Clock,
  BookOpen,
  Filter,
  CheckSquare,
  Square,
  UserCheck,
  UserX,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";
import { createDeadline } from "@/lib/services/deadlineService";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import {
  getReviewInbox,
  saveReviewInbox,
  syncGmailWithReviewFlow,
  setSenderRule,
  getSenderRules,
  type GmailReviewItem,
  type SenderRules,
} from "@/lib/gmailReview";

export default function GmailReviewPage() {
  const [, setLocation] = useLocation();
  const { user: authUser, isLoading: isAuthLoading } = useAuth();
  const userUid = authUser?.uid || (authUser?.usn ? `usn_${authUser.usn}` : "");

  const [items, setItems] = useState<GmailReviewItem[]>([]);
  const [senderRules, setSenderRules] = useState<SenderRules>({ trustedSenders: [], blockedSenders: [] });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Filters & Selection
  const [activeTab, setActiveTab] = useState<"pending" | "high_confidence" | "maybe" | "history">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<GmailReviewItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("23:59");
  const [editCourse, setEditCourse] = useState("");
  const [editImportance, setEditImportance] = useState<ImportanceLevel>("HIGH");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!authUser) {
      setLocation("/login");
    }
  }, [authUser, isAuthLoading, setLocation]);

  // Load Review Inbox & Rules
  useEffect(() => {
    if (!userUid) return;
    const loadedItems = getReviewInbox(userUid);
    setItems(loadedItems);
    setSenderRules(getSenderRules(userUid));

    // Pre-select high-confidence (>= 0.85) relevant pending items
    const highConfIds = new Set(
      loadedItems
        .filter((i) => i.status === "pending" && i.verdict === "relevant" && i.confidence >= 0.85)
        .map((i) => i.id)
    );
    setSelectedIds(highConfIds);
  }, [userUid]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSyncNow = async () => {
    if (!userUid) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const stats = await syncGmailWithReviewFlow(userUid, false);
      const updated = getReviewInbox(userUid);
      setItems(updated);
      setSyncFeedback(stats.feedback);

      // Pre-select high-confidence relevant items from updated inbox
      const highConf = new Set(
        updated
          .filter((i) => i.status === "pending" && i.verdict === "relevant" && i.confidence >= 0.85)
          .map((i) => i.id)
      );
      setSelectedIds(highConf);
      showToast(stats.feedback);
    } catch (err: any) {
      console.warn("Review sync error:", err);
      showToast(err?.message || "Sync failed. Please try reconnecting Gmail in Settings.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Action: Add single item as DeadlineIQ task
  const handleAddDeadline = async (item: GmailReviewItem, customData?: Partial<Deadline>) => {
    if (!userUid) return;
    try {
      const currentDate = new Date().toISOString().split("T")[0];
      const dueDate = customData?.dueDate || item.extracted.dueDate || currentDate;
      const dueTime = customData?.dueTime || item.extracted.dueTime || "23:59";
      const title = customData?.taskName || item.extracted.title || item.subject;
      const subject = customData?.subject || item.extracted.course || item.course || "Academic Email";
      const importance = customData?.importance || "HIGH";

      const deadlinePayload: Deadline = {
        id: `gmail_${item.id}`,
        taskName: title,
        subject: subject,
        description: `${item.extracted.notes || item.reason}\n\nSender: ${item.sender}\nReceived: ${item.dateReceived}`,
        dueDate: dueDate,
        dueTime: dueTime,
        importance: importance,
        completed: false,
        createdAt: new Date().toISOString(),
        source: "ai",
        sourceType: "imported",
        sourceId: item.id,
        dateSource: item.extracted.dueDate ? "ai-extracted" : "user-entered",
        confidence: item.confidence >= 0.85 ? "HIGH" : "MEDIUM",
      };

      await createDeadline(userUid, deadlinePayload);

      // Update local item status to "added"
      const updatedList = items.map((i) => (i.id === item.id ? { ...i, status: "added" as const } : i));
      setItems(updatedList);
      saveReviewInbox(userUid, updatedList);

      // Deselect if selected
      const nextSel = new Set(selectedIds);
      nextSel.delete(item.id);
      setSelectedIds(nextSel);

      showToast(`Added "${title}" to your deadlines!`);
    } catch (err: any) {
      console.warn("Failed to save deadline:", err);
      showToast("Failed to save deadline. Please try again.", "error");
    }
  };

  // Action: Dismiss single item
  const handleDismiss = (itemId: string) => {
    if (!userUid) return;
    const updatedList = items.map((i) => (i.id === itemId ? { ...i, status: "dismissed" as const } : i));
    setItems(updatedList);
    saveReviewInbox(userUid, updatedList);

    const nextSel = new Set(selectedIds);
    nextSel.delete(itemId);
    setSelectedIds(nextSel);

    showToast("Email notice dismissed.");
  };

  // Action: Edit Modal Trigger
  const openEditModal = (item: GmailReviewItem) => {
    setEditingItem(item);
    setEditTitle(item.extracted.title || item.subject);
    setEditDueDate(item.extracted.dueDate || new Date().toISOString().split("T")[0]);
    setEditDueTime(item.extracted.dueTime || "23:59");
    setEditCourse(item.extracted.course || item.course || "");
    setEditImportance("HIGH");
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSavingEdit(true);
    await handleAddDeadline(editingItem, {
      taskName: editTitle,
      dueDate: editDueDate,
      dueTime: editDueTime,
      subject: editCourse || "Academic Email",
      importance: editImportance,
    });
    setIsSavingEdit(false);
    setEditingItem(null);
  };

  // Action: Sender trust/block rules
  const handleRuleChange = (senderEmail: string, action: "trust" | "block") => {
    if (!userUid || !senderEmail) return;
    const updatedRules = setSenderRule(userUid, senderEmail, action);
    setSenderRules(updatedRules);
    showToast(
      action === "trust"
        ? `Always trusting emails from ${senderEmail}`
        : `Never showing emails from ${senderEmail}`
    );
  };

  // Bulk Actions
  const handleToggleSelectAll = (filteredItems: GmailReviewItem[]) => {
    const allFilteredIds = filteredItems.map((i) => i.id);
    const isAllSelected = allFilteredIds.every((id) => selectedIds.has(id));

    const nextSel = new Set(selectedIds);
    if (isAllSelected) {
      allFilteredIds.forEach((id) => nextSel.delete(id));
    } else {
      allFilteredIds.forEach((id) => nextSel.add(id));
    }
    setSelectedIds(nextSel);
  };

  const handleBulkAdd = async () => {
    const toAdd = items.filter((i) => i.status === "pending" && selectedIds.has(i.id));
    if (toAdd.length === 0) return;

    let successCount = 0;
    for (const item of toAdd) {
      try {
        await handleAddDeadline(item);
        successCount++;
      } catch {}
    }
    showToast(`Added ${successCount} task(s) to your deadlines!`);
  };

  const handleBulkDismiss = () => {
    const toDismissIds = items.filter((i) => i.status === "pending" && selectedIds.has(i.id)).map((i) => i.id);
    if (toDismissIds.length === 0) return;

    const updatedList = items.map((i) =>
      toDismissIds.includes(i.id) ? { ...i, status: "dismissed" as const } : i
    );
    setItems(updatedList);
    saveReviewInbox(userUid, updatedList);

    const nextSel = new Set(selectedIds);
    toDismissIds.forEach((id) => nextSel.delete(id));
    setSelectedIds(nextSel);

    showToast(`Dismissed ${toDismissIds.length} notice(s).`);
  };

  // Filtered views
  const pendingItems = useMemo(() => items.filter((i) => i.status === "pending"), [items]);

  const displayedItems = useMemo(() => {
    if (activeTab === "pending") return pendingItems;
    if (activeTab === "high_confidence")
      return pendingItems.filter((i) => i.verdict === "relevant" && i.confidence >= 0.85);
    if (activeTab === "maybe") return pendingItems.filter((i) => i.verdict === "maybe");
    if (activeTab === "history") return items.filter((i) => i.status !== "pending");
    return pendingItems;
  }, [items, pendingItems, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background text-slate-900 dark:text-text-primary transition-colors duration-200 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface/90 backdrop-blur-md">
        <div className="max-w-[1140px] mx-auto px-4 sm:px-6 md:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-elevated cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Account Settings</span>
            </Link>
            <div className="h-4 w-px bg-slate-200 dark:bg-border hidden sm:block" />
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-rose-500" />
              <h1 className="text-sm font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                Gmail Review Inbox
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync Inbox"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1140px] w-full mx-auto px-4 sm:px-6 md:px-12 py-8 space-y-6">
        {/* Toast feedback */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`p-3.5 rounded-xl text-xs font-medium border shadow-xs flex items-center justify-between gap-3 ${
                toastMessage.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="flex-shrink-0" />
                <span>{toastMessage.text}</span>
              </div>
              <button type="button" onClick={() => setToastMessage(null)} className="cursor-pointer">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Privacy Note Banner */}
        <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
          <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Privacy Note:</strong> DeadlineIQ only reads message subject lines and body text to find assignment deadlines. We never auto-send, delete, or modify your emails.
          </p>
        </div>

        {/* Filter Tabs & Bulk Actions Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-border pb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "pending"
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                  : "text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated"
              }`}
            >
              All Pending ({pendingItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("high_confidence")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "high_confidence"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated"
              }`}
            >
              High Confidence (≥85%)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("maybe")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "maybe"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated"
              }`}
            >
              Needs Review / Unsure
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "text-slate-600 dark:text-text-secondary hover:bg-slate-100 dark:hover:bg-surface-elevated"
              }`}
            >
              History ({items.length - pendingItems.length})
            </button>
          </div>

          {/* Bulk Controls (for pending tabs) */}
          {activeTab !== "history" && displayedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleSelectAll(displayedItems)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-border text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-elevated flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {displayedItems.every((i) => selectedIds.has(i.id)) ? (
                  <CheckSquare size={14} className="text-blue-500" />
                ) : (
                  <Square size={14} />
                )}
                <span>Select All</span>
              </button>

              <button
                type="button"
                onClick={handleBulkAdd}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1"
              >
                <Check size={13} />
                <span>Add Selected ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={handleBulkDismiss}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <span>Dismiss</span>
              </button>
            </div>
          )}
        </div>

        {/* Empty State */}
        {displayedItems.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-surface/90 rounded-2xl border border-slate-200 dark:border-border p-8">
            <Mail size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-800 dark:text-white">
              {activeTab === "pending"
                ? "No pending emails to review"
                : activeTab === "history"
                ? "No processed emails in history"
                : "No matching items in this filter"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-text-secondary mt-1 max-w-md mx-auto">
              Click <strong>Sync Inbox</strong> above to scan your Gmail for new course notices and assignment updates.
            </p>
          </div>
        )}

        {/* Item Cards List */}
        <div className="space-y-4">
          {displayedItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const isHighConfidence = item.verdict === "relevant" && item.confidence >= 0.85;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-5 transition-all bg-white dark:bg-surface/90 backdrop-blur-md shadow-xs relative ${
                  isSelected
                    ? "border-blue-500/60 ring-1 ring-blue-500/30"
                    : "border-slate-200 dark:border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Selection Checkbox & Core Details */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {item.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(selectedIds);
                          if (isSelected) next.delete(item.id);
                          else next.add(item.id);
                          setSelectedIds(next);
                        }}
                        className="mt-1 text-slate-400 hover:text-blue-500 cursor-pointer flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare size={18} className="text-blue-500" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Subject line & badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.subject}
                        </h3>

                        {/* Verdict Badge */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                            item.verdict === "relevant"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {item.verdict === "relevant" ? "Relevant" : "Maybe / Unsure"}
                        </span>

                        {/* Confidence Score */}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-500 dark:text-text-muted bg-slate-100 dark:bg-surface-elevated">
                          {Math.round(item.confidence * 100)}% confidence
                        </span>

                        {/* Needs Date Warning */}
                        {item.extracted.needsDate && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                            <AlertCircle size={10} /> Needs Date
                          </span>
                        )}

                        {/* Status tag if added/dismissed */}
                        {item.status === "added" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/15 text-blue-700 dark:text-[#76d8fb]">
                            ✓ Added
                          </span>
                        )}
                        {item.status === "dismissed" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-200 dark:bg-white/10">
                            Dismissed
                          </span>
                        )}
                      </div>

                      {/* Sender & Date Received */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-text-secondary flex-wrap">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.sender}</span>
                        <span>•</span>
                        <span>{new Date(item.dateReceived).toLocaleString()}</span>
                        <a
                          href={item.sourceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          <span>Open Email</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>

                      {/* AI Reason & Snippet */}
                      <p className="text-xs text-slate-600 dark:text-text-secondary bg-slate-50 dark:bg-[#0c101a] p-2.5 rounded-xl border border-slate-200/80 dark:border-white/5 leading-relaxed">
                        <span className="font-medium text-slate-900 dark:text-white">AI Reason: </span>
                        {item.reason}
                      </p>

                      {/* Extracted Deadline Preview Box */}
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-border bg-slate-100/50 dark:bg-surface-subtle grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-400">Extracted Task</span>
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {item.extracted.title}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-400">Due Date &amp; Time</span>
                          <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1">
                            <Calendar size={12} className="text-blue-500" />
                            {item.extracted.dueDate ? (
                              <span>{item.extracted.dueDate} at {item.extracted.dueTime || "23:59"}</span>
                            ) : (
                              <span className="text-rose-500 font-semibold">Date Missing</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-400">Course / Type</span>
                          <div className="font-medium text-slate-900 dark:text-white capitalize">
                            {item.extracted.course || item.course || "General"} ({item.extracted.type})
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  {item.status === "pending" && (
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAddDeadline(item)}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Check size={13} />
                        <span>Add</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-surface-elevated text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Edit3 size={13} />
                        <span>Edit &amp; Add</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDismiss(item.id)}
                        className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl text-slate-500 hover:text-rose-600 text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <X size={13} />
                        <span>Dismiss</span>
                      </button>

                      {/* Sender Rule Toggle Controls */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 w-full flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleRuleChange(item.senderEmail, "trust")}
                          className="p-1 rounded text-slate-400 hover:text-emerald-500 text-[10px] cursor-pointer"
                          title="Always trust this sender"
                        >
                          <UserCheck size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRuleChange(item.senderEmail, "block")}
                          className="p-1 rounded text-slate-400 hover:text-rose-500 text-[10px] cursor-pointer"
                          title="Never show this sender"
                        >
                          <UserX size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* EDIT BEFORE ADD MODAL */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-surface p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-border pb-3">
                <h3 className="text-base font-semibold font-['Space_Grotesk'] text-slate-900 dark:text-white">
                  Edit &amp; Add Deadline
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 dark:text-text-secondary font-medium mb-1">
                    Task Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 dark:text-text-secondary font-medium mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-text-secondary font-medium mb-1">
                      Due Time
                    </label>
                    <input
                      type="time"
                      value={editDueTime}
                      onChange={(e) => setEditDueTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-text-secondary font-medium mb-1">
                    Course / Subject
                  </label>
                  <input
                    type="text"
                    value={editCourse}
                    onChange={(e) => setEditCourse(e.target.value)}
                    placeholder="e.g. CS101 or Computer Science"
                    className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-text-secondary font-medium mb-1">
                    Priority / Weight
                  </label>
                  <select
                    value={editImportance}
                    onChange={(e) => setEditImportance(e.target.value as ImportanceLevel)}
                    className="w-full rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-black/40 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="CRITICAL">Critical (Exams, Final Projects)</option>
                    <option value="HIGH">High (Lab Records, Tests)</option>
                    <option value="MEDIUM">Medium (Homework, Homework)</option>
                    <option value="LOW">Low (Optional readings)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-border text-xs font-medium text-slate-600 dark:text-text-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Check size={13} />
                  <span>{isSavingEdit ? "Saving..." : "Save to Deadlines"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
