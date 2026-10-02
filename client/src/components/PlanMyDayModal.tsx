import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Sparkles,
  BookOpen,
  CheckCircle2,
  CalendarDays,
  Coffee,
  X,
  RotateCcw,
  Save,
  Trash2,
  Edit2,
  Plus,
  ArrowRight,
  ExternalLink,
  Flame,
  Check,
  AlertCircle,
  Sliders,
  ChevronDown,
  ChevronUp,
  MapPin,
} from "lucide-react";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import type { TimetableEntry } from "@/lib/timetable";
import type { CalendarEvent } from "@/lib/calendar";
import type {
  ScheduleBlock,
  ScheduleBlockType,
  PlanPreferences,
  SavedDailyPlan,
} from "@/lib/firebase/types";
import {
  generateDailySchedule,
  formatDateToYYYYMMDD,
  formatCurrentTimeHHMM,
  DEFAULT_PLAN_PREFERENCES,
  minutesToTime,
  timeToMinutes,
} from "@/lib/smartPlannerEngine";
import {
  saveDailyPlan,
  getDailyPlan,
  subscribeToDailyPlan,
} from "@/lib/services/planService";

interface PlanMyDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  onCompleteDeadline: (id: string) => Promise<void> | void;
  onViewTask: (id: string) => void;
  onOpenAddDeadline?: () => void;
  onOpenTimetable?: () => void;
}

export default function PlanMyDayModal({
  isOpen,
  onClose,
  uid,
  deadlines,
  timetable,
  events,
  onCompleteDeadline,
  onViewTask,
  onOpenAddDeadline,
  onOpenTimetable,
}: PlanMyDayModalProps) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateToYYYYMMDD(today), [today]);
  const formattedTodayDate = useMemo(() => {
    return today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [today]);

  // Preferences
  const [preferences, setPreferences] = useState<PlanPreferences>(() => {
    const currentMins = timeToMinutes(formatCurrentTimeHHMM(new Date()));
    // If current time is after 09:00, default start to current time rounded up to next 15m
    let start = "09:00";
    if (currentMins > timeToMinutes("09:00")) {
      const roundedMins = Math.ceil(currentMins / 15) * 15;
      start = minutesToTime(Math.min(roundedMins, timeToMinutes("20:00")));
    }
    return {
      ...DEFAULT_PLAN_PREFERENCES,
      startTime: start,
    };
  });

  const [showPreferences, setShowPreferences] = useState(false);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editing Block State
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);

  // Add Custom Block State
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [newBlockActivity, setNewBlockActivity] = useState("");
  const [newBlockType, setNewBlockType] = useState<ScheduleBlockType>("task");
  const [newBlockStart, setNewBlockStart] = useState("14:00");
  const [newBlockEnd, setNewBlockEnd] = useState("15:00");
  const [newBlockReason, setNewBlockReason] = useState("");

  // Load existing plan for today on open
  useEffect(() => {
    if (!isOpen || !uid) return;

    let isMounted = true;
    getDailyPlan(uid, todayStr)
      .then((saved) => {
        if (!isMounted) return;
        if (saved && saved.blocks && saved.blocks.length > 0) {
          setBlocks(saved.blocks);
          if (saved.preferences) setPreferences(saved.preferences);
          setSavedAt(saved.updatedAt || saved.createdAt);
        } else {
          // Automatically generate initial intelligent plan
          handleGeneratePlan();
        }
      })
      .catch((err) => {
        console.warn("Could not load daily plan from cloud/cache:", err);
        if (isMounted) {
          handleGeneratePlan();
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, uid, todayStr]);

  const activeDeadlines = useMemo(
    () => deadlines.filter((d) => !d.completed),
    [deadlines]
  );

  const hasAnyData = useMemo(() => {
    return activeDeadlines.length > 0 || timetable.length > 0 || events.length > 0;
  }, [activeDeadlines, timetable, events]);

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateDailySchedule({
        deadlines,
        timetable,
        events,
        preferences,
        currentDate: new Date(),
      });

      setBlocks(result.blocks);
      setIsAiGenerated(result.isAiGenerated);
      setSavedAt(null);
    } catch (err: any) {
      console.error("Plan generation error:", err);
      setErrorMessage("Could not generate schedule. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePlan = async () => {
    if (!uid) return;
    setIsSaving(true);
    try {
      const planDoc: SavedDailyPlan = {
        id: todayStr,
        date: todayStr,
        blocks,
        preferences,
        createdAt: savedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDailyPlan(uid, planDoc);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to save plan:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlockComplete = async (block: ScheduleBlock) => {
    // If block is linked to a real deadline, complete it in Firebase
    if (block.deadlineId) {
      await onCompleteDeadline(block.deadlineId);
    }
    // Update local block completed status
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === block.id ? { ...b, isCompleted: !b.isCompleted } : b
      )
    );
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleSaveEditBlock = () => {
    if (!editingBlock) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === editingBlock.id ? editingBlock : b))
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
      reason: newBlockReason.trim() || "Custom scheduled block",
      isCompleted: false,
    };
    setBlocks((prev) =>
      [...prev, newBlock].sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    setIsAddingBlock(false);
    setNewBlockActivity("");
    setNewBlockReason("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-4xl bg-surface-elevated border border-border rounded-3xl shadow-xl dark:shadow-[0_20px_70px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full blur-[100px] bg-sky-500/10 dark:bg-[#76d8fb]/15" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 w-96 h-96 rounded-full blur-[100px] bg-purple-500/10 dark:bg-[#a895ff]/15" />

        {/* 1. MODAL HEADER */}
        <div className="relative z-10 px-6 py-5 border-b border-border flex items-center justify-between bg-surface/90 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 border border-primary/30 flex items-center justify-center text-[#0284c7] dark:text-[#76d8fb] shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif]">
                  Plan My Day
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-[#86dcff]">
                  TODAY
                </span>
                {savedAt && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-[#059669] dark:text-[#75d5b0] bg-emerald-500/10 border border-emerald-500/25">
                    <Check size={11} />
                    <span>Saved</span>
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-text-secondary mt-0.5 flex items-center gap-2">
                <Calendar size={12} className="text-[#0284c7] dark:text-[#76d8fb]" />
                <span>{formattedTodayDate}</span>
                <span>•</span>
                <span>Fixed commitments & priority-packed focus</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreferences(!showPreferences)}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                showPreferences
                  ? "bg-primary/20 border-primary/50 text-primary dark:text-white shadow-xs"
                  : "bg-surface-subtle border-border text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
              title="Customize schedule timing & session duration"
            >
              <Sliders size={13} />
              <span className="hidden sm:inline">Preferences</span>
              {showPreferences ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              title="Close planner"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2. OPTIONAL PREFERENCES ACCORDION */}
        <AnimatePresence>
          {showPreferences && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="relative z-10 overflow-hidden border-b border-border bg-surface-subtle px-6 py-4"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Start Time */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1">
                    Available From
                  </label>
                  <input
                    type="time"
                    value={preferences.startTime}
                    onChange={(e) =>
                      setPreferences({ ...preferences, startTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* End Time */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1">
                    Available Until
                  </label>
                  <input
                    type="time"
                    value={preferences.endTime}
                    onChange={(e) =>
                      setPreferences({ ...preferences, endTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Session Length */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1">
                    Session Length
                  </label>
                  <select
                    value={preferences.sessionLengthMinutes}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        sessionLengthMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value={30}>30 mins (Sprint)</option>
                    <option value={45}>45 mins (Balanced)</option>
                    <option value={50}>50 mins (Standard)</option>
                    <option value={60}>60 mins (Deep Work)</option>
                    <option value={90}>90 mins (Ultra Focus)</option>
                  </select>
                </div>

                {/* Break Length */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-text-muted block mb-1">
                    Break Duration
                  </label>
                  <select
                    value={preferences.breakLengthMinutes}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        breakLengthMinutes: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value={5}>5 mins</option>
                    <option value={10}>10 mins</option>
                    <option value={15}>15 mins</option>
                    <option value={20}>20 mins</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <span className="text-[11px] font-mono text-text-muted">
                  Sensible defaults prevent burnout and maintain immovable class hours.
                </span>
                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={isGenerating}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw size={12} className={isGenerating ? "animate-spin" : ""} />
                  <span>Apply & Regenerate</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. MODAL BODY (TIMELINE & INTERACTIVE SCHEDULE) */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-xs font-mono flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isGenerating ? (
            /* Loading State */
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 border border-primary/40 flex items-center justify-center mb-4 shadow-sm">
                <Sparkles size={24} className="text-[#0284c7] dark:text-[#76d8fb] animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                Building your daily schedule...
              </h3>
              <p className="text-xs font-mono text-text-secondary mt-1 max-w-sm">
                Optimizing around your class timetable, deadlines, and break buffers.
              </p>
            </div>
          ) : !hasAnyData && blocks.length === 0 ? (
            /* Empty State: No tasks, classes, or events */
            <div className="py-16 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-[#75d5b0] flex items-center justify-center mx-auto mb-4 shadow-xs">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                No active commitments for today
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary mt-2 leading-relaxed">
                You have no pending deadlines or timetable classes set for today.
                DeadlineIQ strictly never invents fake deadlines or assignments.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                {onOpenAddDeadline && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAddDeadline();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus size={14} />
                    <span>+ Add Deadline</span>
                  </button>
                )}
                {onOpenTimetable && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTimetable();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-text-primary hover:bg-surface-elevated bg-surface border border-border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Calendar size={13} />
                    <span>Setup Timetable</span>
                  </button>
                )}
              </div>
            </div>
          ) : blocks.length === 0 ? (
            /* All slots completed or empty schedule */
            <div className="py-14 text-center">
              <p className="text-xs font-mono text-text-secondary">
                No blocks scheduled for this time window. Click below to generate or add a custom block.
              </p>
              <button
                onClick={handleGeneratePlan}
                className="mt-4 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all cursor-pointer shadow-xs"
              >
                Generate Schedule
              </button>
            </div>
          ) : (
            /* TIMELINE VIEW */
            <div className="relative pl-6 sm:pl-8 space-y-3.5 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-primary/40 before:via-border before:to-transparent">
              {blocks.map((block, index) => {
                const isClass = block.type === "class";
                const isTask = block.type === "task";
                const isEvent = block.type === "event";
                const isBreak = block.type === "break";

                return (
                  <div
                    key={block.id || index}
                    className={`relative p-4 rounded-2xl border transition-all group shadow-xs ${
                      block.isCompleted
                        ? "bg-emerald-500/10 border-emerald-500/30 opacity-80"
                        : isClass
                        ? "bg-emerald-500/[0.06] border-emerald-500/25 hover:border-emerald-500/40"
                        : isTask
                        ? block.priority === "CRITICAL"
                          ? "bg-rose-500/[0.06] border-rose-500/35 hover:border-rose-500/50"
                          : block.priority === "HIGH"
                          ? "bg-amber-500/[0.06] border-amber-500/30 hover:border-amber-500/45"
                          : "bg-sky-500/[0.06] border-sky-500/25 hover:border-sky-500/40"
                        : isEvent
                        ? "bg-purple-500/[0.06] border-purple-500/30 hover:border-purple-500/45"
                        : "bg-surface border-border hover:border-border/80"
                    }`}
                  >
                    {/* Node on vertical timeline track */}
                    <div
                      className={`absolute -left-[27px] sm:-left-[35px] top-5 w-4 h-4 rounded-full border-2 flex items-center justify-center bg-surface-elevated ${
                        block.isCompleted
                          ? "border-[#059669] dark:border-[#75d5b0] text-[#059669] dark:text-[#75d5b0]"
                          : isClass
                          ? "border-[#059669] dark:border-[#75d5b0] text-[#059669] dark:text-[#75d5b0]"
                          : isTask
                          ? block.priority === "CRITICAL"
                            ? "border-rose-500 text-rose-500"
                            : block.priority === "HIGH"
                            ? "border-amber-500 text-amber-500"
                            : "border-sky-500 text-sky-500"
                          : isEvent
                          ? "border-purple-500 text-purple-500"
                          : "border-border text-text-muted"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Time + Activity + Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {/* Time range */}
                          <span className="px-2.5 py-0.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono font-bold text-text-primary flex items-center gap-1.5">
                            <Clock size={12} className="text-[#0284c7] dark:text-[#76d8fb]" />
                            <span>
                              {block.startTime} – {block.endTime}
                            </span>
                          </span>

                          {/* Type Badge */}
                          {isClass && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-[#a7f3d0] flex items-center gap-1">
                              <BookOpen size={11} />
                              <span>CLASS</span>
                            </span>
                          )}

                          {isEvent && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-[#d8ceff] flex items-center gap-1">
                              <CalendarDays size={11} />
                              <span>EVENT</span>
                            </span>
                          )}

                          {isBreak && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider bg-surface-subtle border border-border text-text-secondary flex items-center gap-1">
                              <Coffee size={11} />
                              <span>BREAK</span>
                            </span>
                          )}

                          {isTask && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 ${
                                block.priority === "CRITICAL"
                                  ? "bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-[#fca5a5]"
                                  : block.priority === "HIGH"
                                  ? "bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-[#fed7aa]"
                                  : "bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-[#bae6fd]"
                              }`}
                            >
                              <Flame size={11} />
                              <span>
                                {block.priority ? `${block.priority} PRIORITY` : "TASK"}
                              </span>
                            </span>
                          )}

                          {block.subject && (
                            <span className="text-[11px] font-mono text-text-muted">
                              {block.subject}
                            </span>
                          )}

                          {block.location && (
                            <span className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                              <MapPin size={11} className="text-text-muted" />
                              <span>{block.location}</span>
                            </span>
                          )}
                        </div>

                        {/* Activity Name */}
                        <h4
                          className={`text-base sm:text-lg font-semibold tracking-tight font-['Space_Grotesk',sans-serif] ${
                            block.isCompleted
                              ? "line-through text-text-muted"
                              : "text-text-primary group-hover:text-primary transition-colors"
                          }`}
                        >
                          {block.activity}
                        </h4>

                        {/* Reason / Scheduling Rationale */}
                        {block.reason && (
                          <p className="text-xs text-text-secondary mt-1 font-sans flex items-start gap-1.5 leading-relaxed">
                            <span className="text-primary text-sm leading-none">•</span>
                            <span>{block.reason}</span>
                          </p>
                        )}
                      </div>

                      {/* Right: Actions (Mark Done, View Task, Edit, Remove) */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
                        {isTask && (
                          <button
                            onClick={() => handleToggleBlockComplete(block)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                              block.isCompleted
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-[#a7f3d0] border border-emerald-500/40"
                                : "bg-surface-subtle text-text-secondary hover:text-emerald-600 hover:bg-emerald-500/10 border border-border"
                            }`}
                            title={
                              block.isCompleted
                                ? "Mark uncompleted"
                                : "Mark task completed in DeadlineIQ"
                            }
                          >
                            <Check size={13} />
                            <span>{block.isCompleted ? "Completed" : "Done"}</span>
                          </button>
                        )}

                        {block.deadlineId && (
                          <button
                            onClick={() => {
                              onClose();
                              onViewTask(block.deadlineId!);
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                            title="Scroll to view deadline in dashboard"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => setEditingBlock(block)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                          title="Edit time or description"
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove block from today's plan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline Edit Modal */}
          {editingBlock && (
            <div className="p-4 rounded-2xl bg-surface border border-border shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-primary uppercase">
                  Edit Time Block
                </span>
                <button
                  onClick={() => setEditingBlock(null)}
                  className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={editingBlock.startTime}
                    onChange={(e) =>
                      setEditingBlock({ ...editingBlock, startTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono text-text-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={editingBlock.endTime}
                    onChange={(e) =>
                      setEditingBlock({ ...editingBlock, endTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-text-muted block mb-1">
                  Activity Title
                </label>
                <input
                  type="text"
                  value={editingBlock.activity}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, activity: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs text-text-primary"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-text-muted block mb-1">
                  Scheduling Note / Reason
                </label>
                <input
                  type="text"
                  value={editingBlock.reason || ""}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, reason: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs text-text-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingBlock(null)}
                  className="px-3 py-1 rounded-lg text-xs font-mono text-text-muted hover:text-text-primary"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveEditBlock}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110"
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {/* Add Custom Block Drawer */}
          {isAddingBlock && (
            <div className="p-4 rounded-2xl bg-surface border border-border shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-text-primary uppercase">
                  Add Custom Time Block
                </span>
                <button
                  onClick={() => setIsAddingBlock(false)}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">
                    Type
                  </label>
                  <select
                    value={newBlockType}
                    onChange={(e) =>
                      setNewBlockType(e.target.value as ScheduleBlockType)
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono text-text-primary"
                  >
                    <option value="task">Task / Study</option>
                    <option value="break">Break / Meal</option>
                    <option value="event">Personal Event</option>
                    <option value="class">Class</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newBlockStart}
                    onChange={(e) => setNewBlockStart(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono text-text-primary"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text-muted block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={newBlockEnd}
                    onChange={(e) => setNewBlockEnd(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs font-mono text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-text-muted block mb-1">
                  Activity Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Work on Physics Record, Lunch Break, Gym"
                  value={newBlockActivity}
                  onChange={(e) => setNewBlockActivity(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface-subtle border border-border text-xs text-text-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsAddingBlock(false)}
                  className="px-3 py-1 text-xs font-mono text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCustomBlock}
                  disabled={!newBlockActivity.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  Add Block
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. MODAL FOOTER */}
        <div className="relative z-10 px-6 py-4 border-t border-border bg-surface/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingBlock(!isAddingBlock)}
              className="px-3.5 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus size={13} />
              <span>Add Block</span>
            </button>

            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="px-3.5 py-2 rounded-xl text-xs font-mono text-primary hover:bg-primary/10 border border-primary/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Recalculate schedule with AI"
            >
              <RotateCcw size={13} className={isGenerating ? "animate-spin" : ""} />
              <span>Regenerate</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSavePlan}
              disabled={isSaving || blocks.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white dark:text-[#061520] bg-gradient-to-r from-sky-500 via-sky-600 to-sky-700 dark:from-[#76d8fb] dark:via-[#86dcff] dark:to-[#a0e5f7] hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(2,132,199,0.3)] dark:shadow-[0_0_20px_rgba(118,216,251,0.35)] disabled:opacity-50 active:scale-95"
            >
              <Save size={14} />
              <span>{isSaving ? "Saving Plan..." : "Save Today's Plan"}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
