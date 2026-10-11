import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  BookOpen,
  X,
  RotateCcw,
  Save,
  Trash2,
  Edit2,
  Plus,
  ExternalLink,
  Check,
  AlertCircle,
  MapPin,
  Sparkles,
} from "lucide-react";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import type { TimetableEntry } from "@/lib/timetable";
import type { CalendarEvent } from "@/lib/calendar";
import type { Exam } from "@/lib/exams";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  SavedDailyPlan,
} from "@/lib/firebase/types";
import {
  generateDailySchedule,
  formatDateToYYYYMMDD,
  formatCurrentTimeHHMM,
  computeDynamicWindowPreferences,
  minutesToTime,
  timeToMinutes,
  formatBlockDuration,
} from "@/lib/smartPlannerEngine";
import {
  saveDailyPlan,
  getDailyPlan,
  clearAllDailyPlans,
} from "@/lib/services/planService";
import { getFirebaseAuth } from "@/lib/firebase";

interface PlanMyDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  clickDate?: Date;
  initialMode?: "generate" | "view";
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  exams?: Exam[];
  onCompleteDeadline: (id: string) => Promise<void> | void;
  onViewTask: (id: string) => void;
  onOpenAddDeadline?: () => void;
  onOpenTimetable?: () => void;
  onPlanCleared?: () => void;
}

export default function PlanMyDayModal({
  isOpen,
  onClose,
  uid,
  clickDate,
  initialMode = "generate",
  deadlines,
  timetable,
  events,
  exams = [],
  onCompleteDeadline,
  onViewTask,
  onOpenAddDeadline,
  onOpenTimetable,
  onPlanCleared,
}: PlanMyDayModalProps) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateToYYYYMMDD(today), [today]);
  const formattedTodayDate = useMemo(() => {
    return today.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [today]);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clear All Plans Confirmation State
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  // Edit Block Modal State
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);

  // Add Block Modal State
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [newBlockActivity, setNewBlockActivity] = useState("");
  const [newBlockType, setNewBlockType] = useState<ScheduleBlockType>("task");
  const [newBlockStart, setNewBlockStart] = useState("14:00");
  const [newBlockEnd, setNewBlockEnd] = useState("14:45");
  const [newBlockSubject, setNewBlockSubject] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");

  const planningWindowDisplay = useMemo(() => {
    const now = clickDate || new Date();
    const startHHMM = formatCurrentTimeHHMM(now);
    const startMins = timeToMinutes(startHHMM);
    const endHHMM = minutesToTime((startMins + 9 * 60) % (24 * 60));

    const format12H = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
    };

    return `${format12H(startHHMM)} → ${format12H(endHHMM)} (Next 9 Hours)`;
  }, [clickDate]);

  // Load existing plan or generate fresh plan on open
  useEffect(() => {
    if (!isOpen || !uid) return;

    let isMounted = true;
    const now = clickDate || new Date();

    // Distinguish: SAVED PLAN EXISTS vs NO SAVED PLAN
    getDailyPlan(uid, todayStr)
      .then((saved) => {
        if (!isMounted) return;
        if (saved && saved.blocks && saved.blocks.length > 0) {
          setBlocks(saved.blocks);
        } else if (initialMode === "generate") {
          handleGeneratePlan(now, false);
        } else {
          setBlocks([]);
        }
      })
      .catch((err) => {
        console.warn("Could not load daily plan:", err);
        if (isMounted) {
          if (initialMode === "generate") {
            handleGeneratePlan(now, false);
          } else {
            setBlocks([]);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, uid, todayStr, clickDate, initialMode]);

  const activeDeadlines = useMemo(
    () => (deadlines || []).filter((d) => !d.completed),
    [deadlines]
  );

  const hasAnyData = useMemo(() => {
    return (
      activeDeadlines.length > 0 ||
      (timetable && timetable.length > 0) ||
      (events && events.length > 0) ||
      (exams && exams.length > 0)
    );
  }, [activeDeadlines, timetable, events, exams]);

  const handleGeneratePlan = async (
    overrideDate?: Date,
    planFreeTimeAnyway = false
  ) => {
    setIsGenerating(true);
    setErrorMessage(null);
    const now = overrideDate || clickDate || new Date();
    const dynamicPrefs = computeDynamicWindowPreferences(now);
    try {
      const result = await generateDailySchedule({
        deadlines,
        timetable,
        events,
        exams,
        preferences: dynamicPrefs,
        currentDate: now,
        planFreeTimeAnyway,
      });

      setBlocks(result.blocks);
      setSavedSuccess(false);
    } catch (err: any) {
      console.error("Plan generation error:", err);
      setErrorMessage("Could not generate schedule. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateClick = () => {
    const freshNow = new Date();
    const clickHHMM = formatCurrentTimeHHMM(freshNow);
    const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local";
    const startMins = timeToMinutes(clickHHMM);
    const endMins = (startMins + 9 * 60) % (24 * 60);
    const endHHMM = minutesToTime(endMins);

    console.log("PLAN_MY_DAY_CLICK", {
      localTimestamp: freshNow.toISOString(),
      timezone: tz,
      planningStart: clickHHMM,
      planningEnd: endHHMM,
    });

    handleGeneratePlan(freshNow, false);
  };

  const handleSavePlan = async () => {
    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    if (!currentUser && (!uid || !uid.startsWith("demo-"))) {
      setErrorMessage("Your session has expired. Please sign in again to save your plan.");
      return;
    }
    const targetUid = currentUser?.uid || uid;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const now = clickDate || new Date();
      const dynamicPrefs = computeDynamicWindowPreferences(now);
      const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local";
      const planDoc: SavedDailyPlan = {
        id: todayStr,
        planId: todayStr,
        userId: targetUid,
        date: todayStr,
        timezone: tz,
        planningStart: dynamicPrefs.startTime,
        planningEnd: dynamicPrefs.endTime,
        blocks,
        preferences: dynamicPrefs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDailyPlan(targetUid, planDoc);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.warn("Could not save plan:", err?.message || err);
      let msg = err?.message || err?.error || "Failed to save plan to Cloud Firestore.";
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error) {
          msg = parsed.error;
        }
      } catch {}
      setErrorMessage(`Save Error: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmClearAll = async () => {
    setIsClearing(true);
    setErrorMessage(null);
    try {
      await clearAllDailyPlans(uid);
      setBlocks([]);
      setSavedSuccess(false);
      setClearSuccess(true);
      setShowClearConfirm(false);
      if (onPlanCleared) {
        onPlanCleared();
      }
      setTimeout(() => setClearSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to clear all plans:", err);
      setErrorMessage("Failed to clear all saved plans from Cloud Firestore.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleToggleBlockComplete = async (block: ScheduleBlock) => {
    if (block.deadlineId) {
      await onCompleteDeadline(block.deadlineId);
    }
    const updatedBlocks = blocks.map((b) =>
      b.id === block.id ? { ...b, isCompleted: !b.isCompleted } : b
    );
    setBlocks(updatedBlocks);

    // Auto-sync completed state to Firestore
    if (uid) {
      try {
        const auth = getFirebaseAuth();
        const targetUid = auth?.currentUser?.uid || uid;
        const now = clickDate || new Date();
        const dynamicPrefs = computeDynamicWindowPreferences(now);
        const tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local";
        const planDoc: SavedDailyPlan = {
          id: todayStr,
          planId: todayStr,
          userId: targetUid,
          date: todayStr,
          timezone: tz,
          planningStart: dynamicPrefs.startTime,
          planningEnd: dynamicPrefs.endTime,
          blocks: updatedBlocks,
          preferences: dynamicPrefs,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveDailyPlan(targetUid, planDoc);
      } catch (err) {
        console.warn("Auto-sync completed state to Firestore failed gracefully:", err);
      }
    }
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleSaveEditBlock = () => {
    if (!editingBlock) return;
    setBlocks((prev) =>
      prev
        .map((b) => (b.id === editingBlock.id ? editingBlock : b))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    setEditingBlock(null);
  };

  const handleCreateCustomBlock = () => {
    if (!newBlockActivity.trim()) return;
    const newBlock: ScheduleBlock = {
      id: `custom-${Date.now()}`,
      startTime: newBlockStart,
      endTime: newBlockEnd,
      activity: newBlockActivity.trim(),
      type: newBlockType,
      subject: newBlockSubject.trim() || undefined,
      reason: newBlockReason.trim() || undefined,
      isCompleted: false,
      isAiRecommendation: false,
    };
    setBlocks((prev) =>
      [...prev, newBlock].sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    setIsAddingBlock(false);
    setNewBlockActivity("");
    setNewBlockReason("");
    setNewBlockSubject("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-3xl bg-surface-elevated border border-border rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. CLEAN HEADER */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-surface">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif]">
              Plan My Day
            </h2>
            <p className="text-xs sm:text-sm text-text-muted mt-0.5 flex flex-wrap items-center gap-2">
              <span>Today, {formattedTodayDate}</span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                {planningWindowDisplay}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              title="Close planner"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2. MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-200 text-xs font-mono flex items-center gap-2">
              <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isGenerating ? (
            /* Loading state */
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center mb-3">
                <RotateCcw size={18} className="text-primary animate-spin" />
              </div>
              <p className="text-sm font-medium text-text-primary">
                Generating your next 9 hours...
              </p>
            </div>
          ) : !hasAnyData && blocks.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-4 text-center max-w-sm mx-auto">
              <h3 className="text-lg font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                Nothing scheduled yet
              </h3>
              <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                Add your deadlines or timetable to generate your daily plan.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mt-5">
                {onOpenAddDeadline && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAddDeadline();
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all cursor-pointer shadow-xs"
                  >
                    Add Deadline
                  </button>
                )}
                {onOpenTimetable && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTimetable();
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-medium text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all cursor-pointer"
                  >
                    Set Up Timetable
                  </button>
                )}
              </div>
              <button
                onClick={() => handleGeneratePlan(undefined, true)}
                className="mt-4 text-xs text-primary hover:underline cursor-pointer"
              >
                Plan free time anyway
              </button>
            </div>
          ) : blocks.length === 0 ? (
            /* No blocks in current time window / plans cleared */
            <div className="py-14 text-center max-w-sm mx-auto flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 border border-blue-500/20">
                <Clock size={22} />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                No Active Plan for Today
              </h3>
              <p className="text-xs text-text-secondary max-w-xs mb-4">
                Plan your day dynamically based on your deadlines, classes, and exams.
              </p>
              <button
                type="button"
                onClick={() => handleGeneratePlan(new Date(), false)}
                disabled={isGenerating}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Sparkles size={14} />
                <span>{isGenerating ? "Generating..." : "Generate Schedule (Next 9 Hours)"}</span>
              </button>
            </div>
          ) : (
            /* GENERATED PLAN LIST */
            <div className="space-y-2.5">
              {blocks.map((block) => {
                const isClass = block.type === "class";
                const isEvent = block.type === "event";
                const isBreak = block.type === "break";
                const isRevision = block.type === "revision";
                const isSuggestion = Boolean(
                  block.isAiRecommendation ||
                    block.type === "skill" ||
                    block.type === "review" ||
                    block.type === "organize"
                );
                const isTask = block.type === "task" && !isSuggestion;
                const durationText = formatBlockDuration(block.startTime, block.endTime);

                return (
                  <div
                    key={block.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                      block.isCompleted
                        ? "bg-surface-subtle/60 border-border opacity-70"
                        : isBreak
                        ? "bg-surface/50 border-border/70"
                        : "bg-surface border-border hover:border-border/90"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Time, Duration, Activity, Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {/* Time */}
                          <span className="text-xs font-mono font-bold text-text-primary">
                            {block.startTime} — {block.endTime}
                          </span>

                          {/* Duration */}
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono text-text-muted bg-surface-subtle border border-border/60">
                            {durationText}
                          </span>

                          {/* Category Tag */}
                          {isClass && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              Class
                            </span>
                          )}
                          {isEvent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                              Event
                            </span>
                          )}
                          {isTask && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                              Deadline Work
                            </span>
                          )}
                          {isRevision && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              Exam Revision
                            </span>
                          )}
                          {isBreak && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                              Break
                            </span>
                          )}
                          {isSuggestion && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                              AI Suggestion
                            </span>
                          )}

                          {block.priority && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-subtle text-text-secondary border border-border/60">
                              {block.priority}
                            </span>
                          )}
                        </div>

                        {/* Activity Title */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleBlockComplete(block)}
                            className={`w-4 h-4 rounded flex items-center justify-center border cursor-pointer transition-colors ${
                              block.isCompleted
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "border-border hover:border-primary"
                            }`}
                          >
                            {block.isCompleted && <Check size={12} />}
                          </button>
                          <h4
                            className={`text-sm font-semibold text-text-primary ${
                              block.isCompleted ? "line-through text-text-muted" : ""
                            }`}
                          >
                            {block.activity}
                          </h4>
                        </div>

                        {/* Subject & Reason */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                          {block.subject && (
                            <span className="flex items-center gap-1 font-medium">
                              <BookOpen size={12} />
                              {block.subject}
                            </span>
                          )}
                          {block.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} />
                              {block.location}
                            </span>
                          )}
                          {block.reason && (
                            <span className="italic text-text-secondary">
                              · {block.reason}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1">
                        {block.deadlineId && (
                          <button
                            type="button"
                            onClick={() => onViewTask(block.deadlineId!)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                            title="View Deadline"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingBlock(block)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                          title="Edit block"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove block"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. FOOTER ACTIONS */}
        <div className="px-6 py-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsAddingBlock(true)}
              className="px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-text-primary hover:bg-surface-subtle transition-colors flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
            >
              <Plus size={14} />
              <span>Add Custom Block</span>
            </button>
            <button
              type="button"
              onClick={handleRegenerateClick}
              disabled={isGenerating}
              className="px-3.5 py-2 rounded-xl border border-border text-xs font-semibold text-text-primary hover:bg-surface-subtle transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 w-full sm:w-auto"
            >
              <RotateCcw size={14} className={isGenerating ? "animate-spin" : ""} />
              <span>Regenerate (Next 9 Hours)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/40 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
              title="Clear all saved Plan My Day schedules"
            >
              <Trash2 size={13} />
              <span>Clear All Plans</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSavePlan}
              disabled={isSaving || blocks.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95"
            >
              {isSaving ? (
                <>
                  <RotateCcw size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check size={14} className="text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Plan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4. CLEAR ALL PLANS CONFIRMATION MODAL */}
        <AnimatePresence>
          {showClearConfirm && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-surface-elevated border border-border rounded-2xl p-5 shadow-2xl space-y-4"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex-shrink-0">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">
                      Clear All Saved Plans?
                    </h3>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                      All saved Plan My Day schedules belonging to your account will be removed from Cloud Firestore. Your deadlines, timetable, exams, and academic profile will remain completely untouched.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                  <button
                    type="button"
                    disabled={isClearing}
                    onClick={() => setShowClearConfirm(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary border border-border hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isClearing}
                    onClick={handleConfirmClearAll}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {isClearing ? (
                      <>
                        <RotateCcw size={13} className="animate-spin" />
                        <span>Clearing...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        <span>Clear All Plans</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 4. ADD BLOCK MODAL */}
        <AnimatePresence>
          {isAddingBlock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-surface-elevated border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-base font-bold text-text-primary font-['Space_Grotesk',sans-serif]">
                    Add Custom Block
                  </h3>
                  <button
                    onClick={() => setIsAddingBlock(false)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3.5 pt-1">
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">
                      Activity
                    </label>
                    <input
                      type="text"
                      placeholder="Enter activity or task"
                      value={newBlockActivity}
                      onChange={(e) => setNewBlockActivity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={newBlockStart}
                        onChange={(e) => setNewBlockStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={newBlockEnd}
                        onChange={(e) => setNewBlockEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        Type
                      </label>
                      <select
                        value={newBlockType}
                        onChange={(e) => setNewBlockType(e.target.value as ScheduleBlockType)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                      >
                        <option value="task">Task / Study</option>
                        <option value="revision">Revision</option>
                        <option value="break">Break</option>
                        <option value="event">Event</option>
                        <option value="class">Class</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        Subject (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Enter subject (optional)"
                        value={newBlockSubject}
                        onChange={(e) => setNewBlockSubject(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">
                      Reason / Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Add notes (optional)"
                      value={newBlockReason}
                      onChange={(e) => setNewBlockReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAddingBlock(false)}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCustomBlock}
                    disabled={!newBlockActivity.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    Add Block
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 5. EDIT BLOCK MODAL */}
        <AnimatePresence>
          {editingBlock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md bg-surface-elevated border border-border rounded-2xl shadow-xl p-5 sm:p-6 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-base font-bold text-text-primary font-['Space_Grotesk',sans-serif]">
                    Edit Block
                  </h3>
                  <button
                    onClick={() => setEditingBlock(null)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-3.5 pt-1">
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">
                      Activity
                    </label>
                    <input
                      type="text"
                      value={editingBlock.activity}
                      onChange={(e) =>
                        setEditingBlock({ ...editingBlock, activity: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={editingBlock.startTime}
                        onChange={(e) =>
                          setEditingBlock({ ...editingBlock, startTime: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={editingBlock.endTime}
                        onChange={(e) =>
                          setEditingBlock({ ...editingBlock, endTime: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">
                      Subject (Optional)
                    </label>
                    <input
                      type="text"
                      value={editingBlock.subject || ""}
                      onChange={(e) =>
                        setEditingBlock({ ...editingBlock, subject: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1">
                      Reason / Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={editingBlock.reason || ""}
                      onChange={(e) =>
                        setEditingBlock({ ...editingBlock, reason: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setEditingBlock(null)}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditBlock}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
