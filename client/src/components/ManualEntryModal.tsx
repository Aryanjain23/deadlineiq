import { useState, type FormEvent, useEffect } from "react";
import { X, Calendar, Clock, BookOpen, AlertCircle, Sparkles, Check, ArrowRight, CalendarDays, AlertTriangle, Zap } from "lucide-react";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import {
  getNextClassForSubject,
  getUniqueSubjects,
  type TimetableEntry,
  type NextClassResult,
} from "@/lib/timetable";
import type { CalendarEvent } from "@/lib/calendar";
import { suggestDeadlineDate, type DateSuggestion } from "@/lib/smartScheduler";
import { nanoid } from "nanoid";

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDeadline: (deadline: Deadline) => void;
  timetable?: TimetableEntry[];
  calendarEvents?: CalendarEvent[];
}

const IMPORTANCE_OPTIONS: {
  level: ImportanceLevel;
  label: string;
  desc: string;
}[] = [
  {
    level: "LOW",
    label: "LOW",
    desc: "Minor tasks / readings",
  },
  {
    level: "MEDIUM",
    label: "MEDIUM",
    desc: "Regular assignments",
  },
  {
    level: "HIGH",
    label: "HIGH",
    desc: "Lab records / tests",
  },
  {
    level: "CRITICAL",
    label: "CRITICAL",
    desc: "Exams / final submissions",
  },
];

export default function ManualEntryModal({
  isOpen,
  onClose,
  onAddDeadline,
  timetable = [],
  calendarEvents = [],
}: ManualEntryModalProps) {
  const [taskName, setTaskName] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [importance, setImportance] = useState<ImportanceLevel>("HIGH");
  const [description, setDescription] = useState("");

  const [smartSuggestion, setSmartSuggestion] = useState<DateSuggestion | null>(null);
  const [timetableFeedback, setTimetableFeedback] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    taskName?: string;
    dueDate?: string;
    importance?: string;
  }>({});

  const availableSubjects = getUniqueSubjects(timetable);

  // When subject changes, compute smart suggestion using timetable + calendar events
  useEffect(() => {
    if (subject.trim()) {
      const suggestion = suggestDeadlineDate({
        subject: subject.trim(),
        timetable,
        calendarEvents,
      });
      setSmartSuggestion(suggestion);
      setTimetableFeedback(null);
    } else {
      setSmartSuggestion(null);
      setTimetableFeedback(null);
    }
  }, [subject, timetable, calendarEvents]);

  if (!isOpen) return null;

  const handleApplySuggestion = (sugg: DateSuggestion) => {
    setDueDate(sugg.dateStr);
    setDueTime(sugg.timeStr);
    setTimetableFeedback(`Applied: ${sugg.formattedDisplay}`);
    if (errors.dueDate) {
      setErrors((prev) => ({ ...prev, dueDate: undefined }));
    }
  };

  const handleFindNextClassQuick = () => {
    if (!subject.trim()) {
      setErrors((prev) => ({
        ...prev,
        dueDate: "Please enter or select a subject to find the next class or suggest a date.",
      }));
      return;
    }

    const suggestion = suggestDeadlineDate({
      subject: subject.trim(),
      timetable,
      calendarEvents,
    });

    if (suggestion) {
      handleApplySuggestion(suggestion);
    } else {
      setErrors((prev) => ({
        ...prev,
        dueDate: `No upcoming class found for "${subject}" in your timetable. Please specify a due date manually.`,
      }));
    }
  };

  const validate = () => {
    const newErrors: {
      taskName?: string;
      dueDate?: string;
      importance?: string;
    } = {};

    if (!taskName.trim()) {
      newErrors.taskName = "Task name is required.";
    }
    if (!dueDate.trim()) {
      if (smartSuggestion) {
        newErrors.dueDate = `Due date is required. Smart suggestion: ${smartSuggestion.formattedDisplay} — click "Confirm & Apply Date" above to use this.`;
      } else if (subject.trim()) {
        newErrors.dueDate = `No upcoming class found for "${subject}" in your timetable. Please specify a due date manually.`;
      } else {
        newErrors.dueDate = "Due date is required. Please specify a date or select a subject for smart suggestions.";
      }
    }
    if (!importance) {
      newErrors.importance = "Please select an importance level.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const newDeadline: Deadline = {
      id: `task-${nanoid(8)}`,
      taskName: taskName.trim(),
      subject: subject.trim() || "General",
      description: description.trim() || undefined,
      dueDate,
      dueTime: dueTime.trim() || undefined,
      importance,
      completed: false,
      createdAt: new Date().toISOString(),
      source: "manual",
    };

    onAddDeadline(newDeadline);

    // Reset fields
    setTaskName("");
    setSubject("");
    setDueDate("");
    setDueTime("");
    setImportance("HIGH");
    setDescription("");
    setSmartSuggestion(null);
    setTimetableFeedback(null);
    setErrors({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Deep Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-xl transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Ambient Glow behind modal */}
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] rounded-full bg-[#76d8fb]/10 blur-[120px] opacity-40 dark:opacity-100"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg my-auto rounded-3xl border border-border bg-surface-elevated backdrop-blur-3xl p-7 sm:p-9 shadow-2xl z-10 max-h-[92vh] overflow-y-auto transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 rounded-full border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition-all cursor-pointer shadow-xs"
          aria-label="Close dialog"
        >
          <X size={15} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#0284c7] dark:text-[#76d8fb] uppercase mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#76d8fb] shadow-[0_0_8px_rgba(118,216,251,0.8)]" />
            <span>MANUAL ENTRY · TIMETABLE AWARE</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary font-['Space_Grotesk',sans-serif]">
            Add a deadline
          </h2>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
            Enter academic task details to keep your schedule accurate and in sync.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4.5">
          {/* Task Name */}
          <div>
            <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase mb-1.5">
              Task Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={taskName}
                onChange={(e) => {
                  setTaskName(e.target.value);
                  if (errors.taskName) setErrors((prev) => ({ ...prev, taskName: undefined }));
                }}
                placeholder="e.g. Submit Physics Lab Record"
                className={`w-full bg-surface border ${
                  errors.taskName
                    ? "border-rose-500 ring-2 ring-rose-500/20"
                    : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
                } rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-200`}
              />
            </div>
            {errors.taskName && (
              <p className="mt-1.5 text-[11px] text-rose-500 flex items-center gap-1 font-mono">
                <AlertCircle size={12} />
                <span>{errors.taskName}</span>
              </p>
            )}
          </div>

          {/* Subject / Category & Timetable Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase">
                Subject / Category
              </label>
              <span className="text-[10px] font-mono text-[#0284c7] dark:text-[#76d8fb]">
                Timetable Connected
              </span>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                <BookOpen size={15} />
              </span>
              <input
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.dueDate) setErrors((prev) => ({ ...prev, dueDate: undefined }));
                }}
                placeholder="e.g. Physics, Mathematics, Electronics"
                className="w-full bg-surface border border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-200"
              />
            </div>

            {/* Timetable Quick Subject Pills */}
            {availableSubjects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] font-mono text-text-muted mr-1">Quick pick:</span>
                {availableSubjects.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSubject(s);
                      if (errors.dueDate) setErrors((prev) => ({ ...prev, dueDate: undefined }));
                    }}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      subject.toLowerCase() === s.toLowerCase()
                        ? "border-[#76d8fb]/60 bg-sky-500/15 text-sky-700 dark:text-[#bae6fd] font-semibold"
                        : "border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Context-Aware Smart Suggestion Banner (Timetable + Calendar + Subject) */}
          {smartSuggestion && (
            <div className={`p-3.5 rounded-2xl border backdrop-blur-xl transition-all shadow-xs ${
              smartSuggestion.hasCalendarConflict
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                : "border-[#76d8fb]/40 bg-sky-500/10 text-sky-800 dark:text-[#bae6fd]"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs ${
                    smartSuggestion.hasCalendarConflict
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                      : "bg-[#76d8fb]/20 border-[#76d8fb]/40 text-[#0284c7] dark:text-[#76d8fb]"
                  }`}>
                    {smartSuggestion.hasCalendarConflict ? (
                      <AlertTriangle size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                        smartSuggestion.hasCalendarConflict ? "text-amber-700 dark:text-amber-300" : "text-[#0284c7] dark:text-[#76d8fb]"
                      }`}>
                        Smart Date Suggestion · Timetable & Calendar
                      </span>
                      {smartSuggestion.hasCalendarConflict && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-500/30">
                          Schedule Notice
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-primary font-medium mt-0.5">
                      Suggested target:{" "}
                      <span className="text-accent font-semibold">{smartSuggestion.formattedDisplay}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                      {smartSuggestion.reasoning}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplySuggestion(smartSuggestion)}
                  className="px-3.5 py-1.5 rounded-xl border border-[#76d8fb]/50 bg-[#76d8fb] text-[#05111a] font-semibold text-xs hover:brightness-105 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer flex-shrink-0 self-end sm:self-center active:scale-95"
                >
                  <span>Confirm & Apply Date</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              {timetableFeedback && (
                <div className="mt-2.5 pt-2 border-t border-border text-[11px] font-mono text-emerald-600 dark:text-[#75d5b0] flex items-center gap-1">
                  <Check size={12} />
                  <span>{timetableFeedback}</span>
                </div>
              )}
            </div>
          )}

          {/* Due Date & Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Due Date */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase">
                  Due Date <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleFindNextClassQuick}
                  className="text-[10px] font-mono text-[#0284c7] dark:text-[#76d8fb] hover:underline cursor-pointer flex items-center gap-1"
                  title="Align with next class from timetable"
                >
                  <Zap size={10} />
                  <span>Next class</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (errors.dueDate) setErrors((prev) => ({ ...prev, dueDate: undefined }));
                  }}
                  className={`w-full bg-surface border ${
                    errors.dueDate
                      ? "border-rose-500 ring-2 ring-rose-500/20"
                      : "border-border focus:border-accent focus:ring-1 focus:ring-accent"
                  } rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none transition-all duration-200`}
                />
              </div>
              {errors.dueDate && (
                <p className="mt-1.5 text-[11px] text-rose-500 flex items-start gap-1 font-mono leading-relaxed">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                  <span>{errors.dueDate}</span>
                </p>
              )}
            </div>

            {/* Due Time */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase">
                  Due Time
                </label>
                <span className="text-[10px] font-mono text-text-muted">Optional</span>
              </div>
              <div className="relative">
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full bg-surface border border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none transition-all duration-200"
                />
              </div>
            </div>
          </div>

          {/* Importance Level */}
          <div>
            <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase mb-2">
              Importance <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {IMPORTANCE_OPTIONS.map((opt) => {
                const isSelected = importance === opt.level;
                return (
                  <button
                    key={opt.level}
                    type="button"
                    onClick={() => {
                      setImportance(opt.level);
                      if (errors.importance) setErrors((prev) => ({ ...prev, importance: undefined }));
                    }}
                    className={`py-2.5 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#76d8fb]/80 bg-sky-500/15 shadow-xs scale-[1.02]"
                        : "border-border bg-surface hover:bg-surface-elevated text-text-secondary"
                    }`}
                  >
                    <div
                      className={`text-xs font-mono font-semibold tracking-wider ${
                        isSelected ? "text-sky-700 dark:text-[#76d8fb]" : "text-text-primary"
                      }`}
                    >
                      {opt.label}
                    </div>
                    <div className="text-[9px] text-text-muted truncate mt-0.5">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.importance && (
              <p className="mt-1.5 text-[11px] text-rose-500 flex items-center gap-1 font-mono">
                <AlertCircle size={12} />
                <span>{errors.importance}</span>
              </p>
            )}
          </div>

          {/* Description (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-mono tracking-wider text-text-secondary uppercase">
                Description
              </label>
              <span className="text-[10px] font-mono text-text-muted">Optional</span>
            </div>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes or additional details..."
              className="w-full bg-surface border border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-200 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3.5 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-[#08131b] font-semibold text-xs tracking-tight bg-gradient-to-r from-[#a9e6f5] to-[#7fcfe9] hover:brightness-105 shadow-xs transition-all duration-200 cursor-pointer active:scale-95"
            >
              Add Deadline
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
