import { useState, useEffect } from "react";
import {
  X,
  Check,
  Clock,
  Flame,
  BookOpen,
  Calendar,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  GraduationCap,
  Shield,
  Layers,
} from "lucide-react";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import { formatDueDateTime } from "@/lib/deadlines";
import type { PlannerRecommendation } from "@/lib/planner";

interface FocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: PlannerRecommendation | null;
  upNextRecommendations: PlannerRecommendation[];
  onCompleteTask: (deadlineId: string) => void;
}

export default function FocusModal({
  isOpen,
  onClose,
  recommendation,
  upNextRecommendations,
  onCompleteTask,
}: FocusModalProps) {
  // Focus Timer state (25 minutes Pomodoro by default)
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timerSeconds]);

  // Reset timer when switching tasks
  useEffect(() => {
    setTimerSeconds(25 * 60);
    setIsRunning(false);
    setJustCompleted(false);
  }, [recommendation?.deadline.id]);

  if (!isOpen || !recommendation) return null;

  const { deadline, reasons, urgencyTier } = recommendation;

  const handleMarkComplete = () => {
    setJustCompleted(true);
    setTimeout(() => {
      onCompleteTask(deadline.id);
      setJustCompleted(false);
      // If there are no more tasks up next, close modal
      if (upNextRecommendations.length === 0) {
        onClose();
      }
    }, 600);
  };

  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const getUrgencyBadge = (tier: string) => {
    switch (tier) {
      case "URGENT":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider border border-rose-500/40 text-rose-700 dark:text-[#fca5a5] bg-rose-500/20 shadow-xs flex items-center gap-1.5 animate-pulse">
            <Flame size={12} className="text-rose-500" />
            URGENT FOCUS
          </span>
        );
      case "HIGH":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wider border border-amber-500/40 text-amber-700 dark:text-[#fed7aa] bg-amber-500/20 shadow-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            HIGH PRIORITY
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wider border border-sky-500/40 text-sky-700 dark:text-[#bae6fd] bg-sky-500/15 flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-accent" />
            MEDIUM PRIORITY
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-mono text-text-secondary bg-surface-subtle border border-border">
            STANDARD
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Distraction Free Focus Session"
    >
      {/* Deep atmospheric backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/90 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Fluid glowing light source */}
      <div className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#76d8fb]/15 via-[#fbaf72]/10 to-transparent rounded-full blur-[140px] opacity-40 dark:opacity-70" />

      {/* Main Focus Box */}
      <div className="relative w-full max-w-2xl bg-surface-elevated border border-border rounded-3xl shadow-2xl z-10 overflow-hidden my-auto animate-in zoom-in-95 duration-200 transition-colors">
        
        {/* Modal Top Bar */}
        <div className="px-6 sm:px-8 py-5 border-b border-border flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl border border-accent/40 bg-accent/10 text-accent flex items-center justify-center shadow-xs">
              <Sparkles size={19} className="animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-[#0284c7] dark:text-[#76d8fb] uppercase font-semibold">
                  DISTRACTION-FREE COMMAND
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <h3 className="text-xl font-bold text-text-primary font-['Space_Grotesk',sans-serif] tracking-tight">
                Focus Session
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
            aria-label="Exit Focus Session"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Urgency & Subject Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-surface-subtle border border-border text-text-primary font-mono text-xs font-semibold">
                {deadline.subject}
              </span>
              {getUrgencyBadge(urgencyTier)}
            </div>

            {/* Due Date Indicator */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-text-secondary bg-surface border border-border px-3 py-1 rounded-xl shadow-xs">
              <Clock size={13} className="text-accent" />
              <span>Due: {formatDueDateTime(deadline.dueDate, deadline.dueTime)}</span>
            </div>
          </div>

          {/* Main Task Title */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] leading-tight">
              {deadline.taskName}
            </h2>
            {deadline.description && (
              <p className="text-sm text-text-secondary mt-3 leading-relaxed bg-surface border border-border p-4 rounded-2xl">
                {deadline.description}
              </p>
            )}
          </div>

          {/* Why this is recommended (Contextual Intelligence) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary uppercase block mb-2 font-semibold">
              Why this task is recommended now:
            </span>
            <ul className="space-y-1.5">
              {reasons.map((reason, idx) => (
                <li key={idx} className="flex items-center gap-2 text-xs sm:text-sm text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Optional Focus Timer (25min Pomodoro) */}
          <div className="p-5 rounded-2xl border border-border bg-surface flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="text-3xl sm:text-4xl font-mono font-bold text-text-primary tracking-tight">
                {timeFormatted}
              </div>
              <span className="text-xs text-text-muted font-mono">
                {isRunning ? "Focus timer active" : "Pomodoro interval ready"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRunning(!isRunning)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs ${
                  isRunning
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                    : "bg-sky-500/15 text-sky-700 dark:text-[#bae6fd] border border-sky-500/40 hover:bg-sky-500/25"
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause size={13} />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play size={13} />
                    <span>Start Timer</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRunning(false);
                  setTimerSeconds(25 * 60);
                }}
                className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
                title="Reset timer"
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>

          {/* Action Row: Mark Complete */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={justCompleted}
              className={`w-full sm:w-auto flex-1 py-3.5 px-6 rounded-2xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-98 ${
                justCompleted
                  ? "bg-emerald-500 text-white scale-95"
                  : "bg-gradient-to-r from-[#75d5b0] to-[#55c29a] hover:brightness-105 text-[#061c14] shadow-xs"
              }`}
            >
              <CheckCircle2 size={18} strokeWidth={2.5} />
              <span>{justCompleted ? "Completed! Recalculating next task..." : "Mark Complete & Continue"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-3.5 rounded-2xl text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-subtle border border-border transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Up Next Preview inside modal */}
          {upNextRecommendations.length > 0 && (
            <div className="pt-4 border-t border-border">
              <span className="text-[10px] font-mono text-text-muted tracking-wider uppercase block mb-2">
                Up next after this task:
              </span>
              <div className="space-y-1.5">
                {upNextRecommendations.slice(0, 2).map((item, idx) => (
                  <div
                    key={item.deadline.id}
                    className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-surface border border-border"
                  >
                    <span className="text-text-secondary truncate max-w-[280px]">
                      {idx + 1}. {item.deadline.taskName}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted">
                      {formatDueDateTime(item.deadline.dueDate, item.deadline.dueTime)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
