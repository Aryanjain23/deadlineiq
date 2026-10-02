import { useState, useMemo } from "react";
import {
  Sparkles,
  ArrowRight,
  Flame,
  Clock,
  Compass,
  CheckCircle2,
  ChevronRight,
  Target,
  ExternalLink,
  Layers,
  GraduationCap,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import type { Exam } from "@/lib/exams";
import type { TimetableEntry } from "@/lib/timetable";
import {
  calculateSmartRecommendations,
  type PlannerRecommendation,
  type UrgencyTier,
} from "@/lib/planner";
import { formatDueDateTime } from "@/lib/deadlines";
import FocusModal from "./FocusModal";

interface SmartPlannerProps {
  deadlines: Deadline[];
  exams: Exam[];
  timetable: TimetableEntry[];
  onCompleteDeadline: (id: string) => void;
  onViewTask: (id: string) => void;
}

function formatShortDueDate(dateStr: string): string {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function SmartPlanner({
  deadlines,
  exams,
  timetable,
  onCompleteDeadline,
  onViewTask,
}: SmartPlannerProps) {
  const [isFocusModalOpen, setIsFocusModalOpen] = useState(false);

  // Recalculates automatically whenever deadlines, exams, or timetable updates
  const recommendations = useMemo(() => {
    return calculateSmartRecommendations(deadlines, exams, timetable);
  }, [deadlines, exams, timetable]);

  const topRecommendation = recommendations[0] || null;
  const upNext = recommendations.slice(1, 3);

  const getTierBadge = (tier: UrgencyTier) => {
    switch (tier) {
      case "URGENT":
        return (
          <span className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-mono font-bold tracking-wider border border-rose-500/50 text-rose-700 dark:text-[#fca5a5] bg-rose-500/20 shadow-xs flex items-center gap-1.5 animate-pulse">
            <Flame size={12} className="text-rose-500" />
            URGENT
          </span>
        );
      case "HIGH":
        return (
          <span className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-mono font-semibold tracking-wider border border-amber-500/45 text-amber-700 dark:text-[#fed7aa] bg-amber-500/20 shadow-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            HIGH
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-mono font-medium tracking-wider border border-sky-500/40 text-sky-700 dark:text-[#bae6fd] bg-sky-500/15 flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            MEDIUM
          </span>
        );
      case "LOW":
        return (
          <span className="px-3 py-1 rounded-full text-[10px] sm:text-xs font-mono text-text-secondary bg-surface-subtle border border-border">
            LOW
          </span>
        );
    }
  };

  return (
    <section className="mb-14 relative z-10" aria-label="Smart Academic Planner">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 pb-3 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#0284c7] dark:text-[#76d8fb] uppercase mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#76d8fb] shadow-[0_0_8px_rgba(118,216,251,0.8)]" />
            <span>SMART ACADEMIC PLANNER · REAL-TIME HEURISTICS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary font-['Space_Grotesk',sans-serif] flex items-center gap-3">
            <span>What should I focus on?</span>
          </h2>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Algorithmic priority factoring due dates, priority tiers, timetable proximity & upcoming exams.
          </p>
        </div>

        {topRecommendation && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-xs font-mono text-text-secondary shadow-xs">
            <Target size={13} className="text-[#0284c7] dark:text-[#76d8fb]" />
            <span>Top task score: <strong className="text-text-primary font-medium">{topRecommendation.score} pts</strong></span>
          </div>
        )}
      </div>

      {/* Main Content Area: Focus Now Card + Up Next Card */}
      {!topRecommendation ? (
        /* Empty State */
        <div className="rounded-3xl p-10 sm:p-12 text-center max-w-xl mx-auto shadow-sm border border-border bg-surface">
          <div className="w-12 h-12 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#75d5b0] flex items-center justify-center mx-auto mb-4 shadow-xs">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="text-xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
            You have no active deadlines pending.
          </h3>
          <p className="text-xs sm:text-sm text-text-muted mt-2 max-w-md mx-auto leading-relaxed">
            All current coursework is finished or you haven't added upcoming deadlines yet. Great work keeping your schedule clear!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          
          {/* ================================================== */}
          {/* 1. "FOCUS NOW" HERO CARD (8 COLS ON DESKTOP)       */}
          {/* ================================================== */}
          <div
            className="lg:col-span-8 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group border border-border bg-surface hover:border-accent/40 shadow-sm transition-all duration-300"
          >
            {/* Subtle Corner Aura */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[90px] bg-[#76d8fb]/15 opacity-40 dark:opacity-60" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-[90px] bg-[#fbaf72]/10 opacity-30 dark:opacity-40" />

            {/* Top Bar inside Card */}
            <div className="relative z-10 flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                </span>
                <span className="text-xs font-mono font-bold tracking-widest text-[#0284c7] dark:text-[#76d8fb] uppercase">
                  FOCUS NOW
                </span>
              </div>

              {/* Urgency Tier Indicator */}
              {getTierBadge(topRecommendation.urgencyTier)}
            </div>

            {/* Task Name & Subject */}
            <div className="relative z-10 mb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={topRecommendation.deadline.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <h3 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] leading-tight transition-colors">
                    {topRecommendation.deadline.taskName}
                  </h3>

                  {/* Subject & Due details */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-xs sm:text-sm text-text-secondary font-sans">
                    <span className="px-2.5 py-0.5 rounded-lg bg-surface-subtle border border-border font-mono text-xs text-text-primary font-medium">
                      {topRecommendation.deadline.subject}
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1.5 font-mono text-text-secondary">
                      <Clock size={13} className="text-[#0284c7] dark:text-[#76d8fb]" />
                      <span>{formatDueDateTime(topRecommendation.deadline.dueDate, topRecommendation.deadline.dueTime)}</span>
                    </span>
                  </div>

                  {topRecommendation.deadline.description && (
                    <p className="text-xs sm:text-sm text-text-muted mt-3 line-clamp-2 leading-relaxed">
                      {topRecommendation.deadline.description}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Why this is recommended */}
            <div className="relative z-10 p-4 sm:p-5 rounded-2xl bg-surface-subtle border border-border mb-6">
              <span className="text-[11px] font-mono tracking-wider text-text-secondary uppercase font-semibold block mb-2">
                Why this is recommended:
              </span>
              <ul className="space-y-1.5">
                {topRecommendation.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs sm:text-sm text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons: [ Start Focus ] and [ View Task ] */}
            <div className="relative z-10 pt-4 border-t border-border flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFocusModalOpen(true)}
                className="px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold text-[#06121a] bg-gradient-to-r from-[#76d8fb] via-[#86dcff] to-[#a0e5f7] hover:brightness-105 transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
              >
                <Sparkles size={15} />
                <span>Start Focus</span>
              </button>

              <button
                type="button"
                onClick={() => onViewTask(topRecommendation.deadline.id)}
                className="px-5 py-3 rounded-xl text-xs sm:text-sm font-medium text-text-secondary hover:text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
              >
                <span>View Task</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* ================================================== */}
          {/* 2. "UP NEXT" CARD (4 COLS ON DESKTOP)               */}
          {/* ================================================== */}
          <div className="lg:col-span-4 rounded-3xl p-6 sm:p-7 flex flex-col justify-between border border-border bg-surface shadow-sm">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-border mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-mono text-text-secondary uppercase tracking-wider font-semibold">
                    UP NEXT
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-text-muted">
                  {upNext.length > 0 ? "SMART QUEUE" : "END OF QUEUE"}
                </span>
              </div>

              {upNext.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted font-mono">
                  No additional pending tasks queued after current focus.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {upNext.map((rec, idx) => (
                    <div
                      key={rec.deadline.id}
                      onClick={() => onViewTask(rec.deadline.id)}
                      className="p-3.5 rounded-2xl bg-surface-subtle hover:bg-surface border border-border hover:border-accent/40 transition-all cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold text-[#0284c7] dark:text-[#76d8fb]">
                              {idx + 1}.
                            </span>
                            <span className="text-[10px] font-mono text-text-muted px-2 py-0.2 rounded bg-surface border border-border">
                              {rec.deadline.subject}
                            </span>
                          </div>

                          <h5 className="text-sm font-medium text-text-primary tracking-tight truncate group-hover:text-accent transition-colors">
                            {rec.deadline.taskName}
                          </h5>

                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted mt-1.5">
                            <Clock size={11} className="text-[#ea580c] dark:text-[#fbaf72]" />
                            <span>Due {formatShortDueDate(rec.deadline.dueDate)}</span>
                            {rec.deadline.dueTime && (
                              <span>· {rec.deadline.dueTime}</span>
                            )}
                          </div>
                        </div>

                        <ChevronRight
                          size={15}
                          className="text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 mt-6 border-t border-border text-[11px] font-mono text-text-muted flex items-center justify-between">
              <span>Dynamic priority engine</span>
              <span className="text-[#0284c7] dark:text-[#86dcff]">Auto-adapting</span>
            </div>
          </div>

        </div>
      )}

      {/* Focus Mode Modal */}
      <FocusModal
        isOpen={isFocusModalOpen}
        onClose={() => setIsFocusModalOpen(false)}
        recommendation={topRecommendation}
        upNextRecommendations={upNext}
        onCompleteTask={onCompleteDeadline}
      />
    </section>
  );
}
