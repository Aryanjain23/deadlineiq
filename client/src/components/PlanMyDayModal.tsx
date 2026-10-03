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
  Sliders,
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
  formatBlockDuration,
} from "@/lib/smartPlannerEngine";
import {
  saveDailyPlan,
  getDailyPlan,
} from "@/lib/services/planService";

interface PlanMyDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  deadlines: Deadline[];
  timetable: TimetableEntry[];
  events: CalendarEvent[];
  exams?: Exam[];
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
  exams = [],
  onCompleteDeadline,
  onViewTask,
  onOpenAddDeadline,
  onOpenTimetable,
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

  // Preferences State
  const [preferences, setPreferences] = useState<PlanPreferences>(() => {
    const currentMins = timeToMinutes(formatCurrentTimeHHMM(new Date()));
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

  const [draftPreferences, setDraftPreferences] = useState<PlanPreferences>(preferences);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Load existing plan for today on open
  useEffect(() => {
    if (!isOpen || !uid) return;

    let isMounted = true;
    getDailyPlan(uid, todayStr)
      .then((saved) => {
        if (!isMounted) return;
        if (saved && saved.blocks && saved.blocks.length > 0) {
          setBlocks(saved.blocks);
          if (saved.preferences) {
            setPreferences(saved.preferences);
            setDraftPreferences(saved.preferences);
          }
        } else {
          handleGeneratePlan(false);
        }
      })
      .catch((err) => {
        console.warn("Could not load daily plan:", err);
        if (isMounted) {
          handleGeneratePlan(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, uid, todayStr]);

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

  const handleGeneratePlan = async (planFreeTimeAnyway = false) => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const result = await generateDailySchedule({
        deadlines,
        timetable,
        events,
        exams,
        preferences,
        currentDate: new Date(),
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

  const handleApplyPreferences = () => {
    setPreferences(draftPreferences);
    setShowPreferencesModal(false);
    setIsGenerating(true);
    setErrorMessage(null);

    generateDailySchedule({
      deadlines,
      timetable,
      events,
      exams,
      preferences: draftPreferences,
      currentDate: new Date(),
    })
      .then((res) => {
        setBlocks(res.blocks);
        setSavedSuccess(false);
      })
      .catch((err) => {
        console.error("Failed to generate plan with new preferences:", err);
        setErrorMessage("Could not update schedule. Please try again.");
      })
      .finally(() => {
        setIsGenerating(false);
      });
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDailyPlan(uid, planDoc);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save plan:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlockComplete = async (block: ScheduleBlock) => {
    if (block.deadlineId) {
      await onCompleteDeadline(block.deadlineId);
    }
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
            <p className="text-xs sm:text-sm text-text-muted mt-0.5">
              Today, {formattedTodayDate}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDraftPreferences(preferences);
                setShowPreferencesModal(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-border text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders size={13} />
              <span>Preferences</span>
            </button>

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
                Generating your plan...
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
                onClick={() => handleGeneratePlan(true)}
                className="mt-4 text-xs text-primary hover:underline cursor-pointer"
              >
                Plan free time anyway
              </button>
            </div>
          ) : blocks.length === 0 ? (
            /* No blocks in current time window */
            <div className="py-12 text-center max-w-xs mx-auto">
              <p className="text-xs text-text-secondary">
                No blocks scheduled for this time window.
              </p>
              <button
                onClick={() => handleGeneratePlan(true)}
                className="mt-3 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 cursor-pointer"
              >
                Generate Plan
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
                          {isRevision && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              Revision
                            </span>
                          )}
                          {isBreak && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-text-muted bg-surface-subtle border border-border/50">
                              Break
                            </span>
                          )}
                          {isSuggestion && !isRevision && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                              Suggestion
                            </span>
                          )}
                          {isTask && block.priority && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                block.priority === "CRITICAL"
                                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25"
                                  : block.priority === "HIGH"
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                                  : "bg-surface-subtle text-text-secondary border border-border"
                              }`}
                            >
                              {block.priority}
                            </span>
                          )}

                          {/* Subject */}
                          {block.subject && (
                            <span className="text-xs text-text-secondary font-medium">
                              {block.subject}
                            </span>
                          )}

                          {/* Location */}
                          {block.location && (
                            <span className="text-xs text-text-muted flex items-center gap-1">
                              <MapPin size={11} />
                              <span>{block.location}</span>
                            </span>
                          )}
                        </div>

                        {/* Activity Name */}
                        <h4
                          className={`text-sm sm:text-base font-semibold tracking-tight ${
                            block.isCompleted
                              ? "line-through text-text-muted"
                              : "text-text-primary"
                          }`}
                        >
                          {block.activity}
                        </h4>

                        {/* Short Reason only when useful */}
                        {block.reason && !isBreak && (
                          <p className="text-xs text-text-muted mt-0.5 leading-normal">
                            {block.reason}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                        {/* Complete Task Toggle */}
                        {(isTask || isRevision || isSuggestion) && (
                          <button
                            onClick={() => handleToggleBlockComplete(block)}
                            className={`p-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                              block.isCompleted
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                : "border-border text-text-muted hover:text-text-primary hover:bg-surface-subtle"
                            }`}
                            title={block.isCompleted ? "Completed" : "Mark done"}
                          >
                            <Check size={14} />
                          </button>
                        )}

                        {block.deadlineId && (
                          <button
                            onClick={() => {
                              onClose();
                              onViewTask(block.deadlineId!);
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                            title="View deadline"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => setEditingBlock(block)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
                          title="Edit block"
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove block"
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
        </div>

        {/* 3. CLEAN FOOTER CONTROLS */}
        <div className="px-5 sm:px-6 py-4 border-t border-border bg-surface flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingBlock(true)}
              className="px-3 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary bg-surface-subtle hover:bg-surface border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Block</span>
            </button>

            <button
              onClick={() => handleGeneratePlan(false)}
              disabled={isGenerating}
              className="px-3 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary bg-surface-subtle hover:bg-surface border border-border transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw size={13} className={isGenerating ? "animate-spin" : ""} />
              <span>Regenerate</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSavePlan}
              disabled={isSaving || blocks.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save size={13} />
              <span>{savedSuccess ? "Saved" : isSaving ? "Saving..." : "Save Plan"}</span>
            </button>

            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary bg-surface border border-border transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* 4. PREFERENCES MODAL */}
        <AnimatePresence>
          {showPreferencesModal && (
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
                    Planner Preferences
                  </h3>
                  <button
                    onClick={() => setShowPreferencesModal(false)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4 pt-1">
                  {/* Start & End Times */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">
                        Available from
                      </label>
                      <input
                        type="time"
                        value={draftPreferences.startTime}
                        onChange={(e) =>
                          setDraftPreferences({
                            ...draftPreferences,
                            startTime: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-text-secondary block mb-1.5">
                        Available until
                      </label>
                      <input
                        type="time"
                        value={draftPreferences.endTime}
                        onChange={(e) =>
                          setDraftPreferences({
                            ...draftPreferences,
                            endTime: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Session Length */}
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">
                      Session length
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[30, 45, 50, 60, 90].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() =>
                            setDraftPreferences({
                              ...draftPreferences,
                              sessionLengthMinutes: mins,
                            })
                          }
                          className={`py-2 rounded-xl text-xs font-mono transition-colors cursor-pointer border ${
                            draftPreferences.sessionLengthMinutes === mins
                              ? "bg-primary text-primary-foreground border-primary font-semibold"
                              : "bg-surface border-border text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Break Duration */}
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">
                      Break duration
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[5, 10, 15, 20].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() =>
                            setDraftPreferences({
                              ...draftPreferences,
                              breakLengthMinutes: mins,
                            })
                          }
                          className={`py-2 rounded-xl text-xs font-mono transition-colors cursor-pointer border ${
                            draftPreferences.breakLengthMinutes === mins
                              ? "bg-primary text-primary-foreground border-primary font-semibold"
                              : "bg-surface border-border text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowPreferencesModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPreferences}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:brightness-110 transition-all cursor-pointer shadow-xs"
                  >
                    Apply & Update
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 5. ADD BLOCK MODAL */}
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
                    Add Block
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
                      placeholder="e.g. Mathematics revision, Coding practice"
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
                        placeholder="e.g. Mathematics"
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
                      placeholder="e.g. Due tomorrow"
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

        {/* 6. EDIT BLOCK MODAL */}
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
