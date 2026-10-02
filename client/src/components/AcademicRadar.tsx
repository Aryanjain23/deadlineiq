import { useState } from "react";
import {
  Calendar,
  Clock,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
  MapPin,
  ChevronRight,
  BookOpen,
  Filter,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  buildAcademicRadar,
  getRelativeTimeDescription,
  formatTime12Hour,
  type Exam,
  type ExamType,
  type RadarItem,
  type RadarItemType,
} from "@/lib/exams";
import type { Deadline, ImportanceLevel } from "@/lib/deadlines";
import type { TimetableEntry } from "@/lib/timetable";

interface AcademicRadarProps {
  deadlines: Deadline[];
  exams: Exam[];
  timetable: TimetableEntry[];
  onToggleDeadline: (id: string) => void;
  onOpenExamsModal: () => void;
  onOpenTimetableModal: () => void;
}

export default function AcademicRadar({
  deadlines,
  exams,
  timetable,
  onToggleDeadline,
  onOpenExamsModal,
  onOpenTimetableModal,
}: AcademicRadarProps) {
  const [filterType, setFilterType] = useState<"all" | "exam" | "deadline" | "class">("all");

  const radarItems = buildAcademicRadar(deadlines, exams, timetable);

  const filteredItems = radarItems.filter((item) => {
    if (filterType === "all") return true;
    return item.type === filterType;
  });

  // Group items chronologically
  const groups: { label: string; items: RadarItem[] }[] = [];
  const groupOrder: RadarItem["urgencyGroup"][] = [
    "TODAY",
    "TOMORROW",
    "IN 2 DAYS",
    "IN 3 DAYS",
    "THIS WEEK",
    "UPCOMING",
    "PAST",
  ];

  for (const groupName of groupOrder) {
    const itemsInGroup = filteredItems.filter((item) => item.urgencyGroup === groupName);
    if (itemsInGroup.length > 0) {
      groups.push({
        label: groupName,
        items: itemsInGroup,
      });
    }
  }

  const getPriorityBadge = (importance?: ImportanceLevel) => {
    switch (importance) {
      case "CRITICAL":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-[#fb7185]/40 text-[#fca5a5] bg-[#fb7185]/15 font-semibold flex items-center gap-1 shadow-[0_0_10px_rgba(251,113,133,0.25)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fb7185]" />
            <AlertCircle size={10} className="text-[#fb7185]" />
            CRITICAL
          </span>
        );
      case "HIGH":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-[#fbaf72]/40 text-[#fed7aa] bg-[#fbaf72]/15 font-semibold flex items-center gap-1 shadow-[0_0_8px_rgba(251,175,114,0.2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#fbaf72]" />
            HIGH
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-[#76d8fb]/35 text-[#bae6fd] bg-[#76d8fb]/12 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#76d8fb]" />
            MEDIUM
          </span>
        );
      case "LOW":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-border text-text-muted bg-surface-subtle font-medium">
            LOW
          </span>
        );
      default:
        return null;
    }
  };

  const getExamBadge = (examType?: ExamType) => {
    switch (examType) {
      case "SEE":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-rose-500/40 text-rose-700 dark:text-[#fca5a5] bg-rose-500/15 dark:bg-[#fb7185]/20 font-bold shadow-sm flex items-center gap-1">
            <GraduationCap size={11} />
            SEE EXAM
          </span>
        );
      case "Internal":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-amber-500/40 text-amber-700 dark:text-[#fed7aa] bg-amber-500/15 dark:bg-[#fbaf72]/20 font-bold shadow-sm flex items-center gap-1">
            <GraduationCap size={11} />
            INTERNAL EXAM
          </span>
        );
      case "Lab":
      case "Practical":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-emerald-500/40 text-emerald-700 dark:text-[#a7f3d0] bg-emerald-500/15 dark:bg-[#75d5b0]/20 font-bold flex items-center gap-1">
            <GraduationCap size={11} />
            {examType.toUpperCase()} EXAM
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-purple-500/40 text-purple-700 dark:text-[#d8ceff] bg-purple-500/15 dark:bg-[#a895ff]/20 font-bold flex items-center gap-1">
            <GraduationCap size={11} />
            {examType ? `${examType.toUpperCase()} EXAM` : "EXAM"}
          </span>
        );
    }
  };

  // Counts for filter pills
  const totalCount = radarItems.length;
  const examCount = radarItems.filter((i) => i.type === "exam").length;
  const deadlineCount = radarItems.filter((i) => i.type === "deadline").length;
  const classCount = radarItems.filter((i) => i.type === "class").length;

  return (
    <section className="mb-14 relative z-10" aria-label="Schedule Timeline">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-4 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-1.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            <span>UPCOMING SCHEDULE & DEADLINES</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary font-['Space_Grotesk',sans-serif] flex items-center gap-3">
            <span>Schedule Timeline</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-normal border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.04]">
              {totalCount} upcoming
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Chronological overview of your deadlines, exams, and classes.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
              filterType === "all"
                ? "bg-surface-elevated text-text-primary border border-border shadow-sm font-semibold"
                : "bg-surface-subtle text-text-muted hover:text-text-primary border border-transparent hover:border-border"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("exam")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterType === "exam"
                ? "bg-amber-500/20 text-amber-700 dark:text-[#fed7aa] border border-amber-500/50 shadow-sm font-semibold"
                : "bg-surface-subtle text-text-muted hover:text-amber-600 dark:hover:text-[#fbaf72] border border-transparent hover:border-amber-500/20"
            }`}
          >
            <GraduationCap size={12} className="text-amber-500" />
            <span>Exams ({examCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType("deadline")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterType === "deadline"
                ? "bg-sky-500/20 text-sky-700 dark:text-[#bae6fd] border border-sky-500/50 shadow-sm font-semibold"
                : "bg-surface-subtle text-text-muted hover:text-sky-600 dark:hover:text-[#76d8fb] border border-transparent hover:border-sky-500/20"
            }`}
          >
            <CheckCircle2 size={12} className="text-sky-500" />
            <span>Deadlines ({deadlineCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType("class")}
            className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterType === "class"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-[#a7f3d0] border border-emerald-500/50 shadow-sm font-semibold"
                : "bg-surface-subtle text-text-muted hover:text-emerald-600 dark:hover:text-[#75d5b0] border border-transparent hover:border-emerald-500/20"
            }`}
          >
            <Calendar size={12} className="text-emerald-500" />
            <span>Classes ({classCount})</span>
          </button>
        </div>
      </div>

      {/* Main Timeline Feed */}
      {groups.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-10 text-center max-w-xl mx-auto shadow-xs">
          <Calendar size={28} className="mx-auto text-slate-400 mb-3 opacity-70" />
          <h4 className="text-lg font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
            No upcoming items
          </h4>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            No events match the selected filter. Add deadlines or exams to populate your timeline.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => {
            const isToday = group.label === "TODAY";
            const isTomorrow = group.label === "TOMORROW";

            return (
              <div key={group.label} className="space-y-3">
                {/* Time Anchor Header (e.g. TODAY ───────) */}
                <div className="flex items-center gap-3 px-1">
                  <span
                    className={`text-xs font-mono font-bold tracking-widest ${
                      isToday
                        ? "text-rose-600 dark:text-[#fb7185] flex items-center gap-1.5"
                        : isTomorrow
                        ? "text-amber-600 dark:text-[#fbaf72]"
                        : "text-text-muted"
                    }`}
                  >
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    )}
                    {group.label}
                  </span>
                  <div
                    className={`flex-1 h-[1px] ${
                      isToday
                        ? "bg-gradient-to-r from-rose-500/40 via-rose-500/15 to-transparent"
                        : isTomorrow
                        ? "bg-gradient-to-r from-amber-500/30 via-amber-500/10 to-transparent"
                        : "bg-border"
                    }`}
                  />
                  <span className="text-[10px] font-mono text-text-muted">
                    {group.items.length} {group.items.length === 1 ? "EVENT" : "EVENTS"}
                  </span>
                </div>

                {/* Cards in this time bucket */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {group.items.map((item) => {
                    const originalDeadlineId = item.id.replace("radar-dl-", "");

                    // EXAM CARD
                    if (item.type === "exam") {
                      return (
                        <div
                          key={item.id}
                          className="bg-surface hover:bg-surface-elevated border border-border border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-sm group transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {/* Top meta row */}
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-[#fed7aa] text-[10px] font-mono font-semibold">
                                  {item.subject}
                                </span>
                                {item.subjectCode && (
                                  <span className="text-[10px] font-mono text-text-muted">
                                    {item.subjectCode}
                                  </span>
                                )}
                                {getExamBadge(item.examType)}
                              </div>

                              {/* Title */}
                              <h4 className="text-base font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] group-hover:text-amber-600 dark:group-hover:text-[#fed7aa] transition-colors">
                                {item.title}
                              </h4>

                              {/* Time & Room */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-text-secondary">
                                <span className="flex items-center gap-1.5 font-mono text-text-primary font-medium">
                                  <Clock size={12} className="text-amber-500" />
                                  <span>
                                    {item.time ? formatTime12Hour(item.time) : "TBD"}
                                    {item.endTime ? ` - ${formatTime12Hour(item.endTime)}` : ""}
                                  </span>
                                </span>

                                {item.room && (
                                  <>
                                    <span className="text-text-muted">•</span>
                                    <span className="flex items-center gap-1.5 text-text-secondary">
                                      <MapPin size={12} className="text-sky-500" />
                                      <span>{item.room}</span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Notes */}
                              {item.description && (
                                <p className="text-xs text-text-muted mt-2 line-clamp-1 italic">
                                  "{item.description}"
                                </p>
                              )}

                              {/* Cross-reference: Linked deadlines in same subject */}
                              {item.relatedDeadlines && item.relatedDeadlines.length > 0 && (
                                <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] font-mono text-amber-600 dark:text-[#fbaf72]">
                                  <span className="flex items-center gap-1">
                                    <AlertCircle size={12} className="text-rose-500" />
                                    <span>
                                      {item.relatedDeadlines.length} active assignment due before this exam
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={onOpenExamsModal}
                                    className="text-[10px] text-text-secondary hover:text-text-primary flex items-center gap-1 transition-colors"
                                  >
                                    <span>Details</span>
                                    <ChevronRight size={12} />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* View Button */}
                            <button
                              type="button"
                              onClick={onOpenExamsModal}
                              className="p-1.5 text-text-muted hover:text-amber-500 hover:bg-surface-subtle rounded-xl transition-all cursor-pointer flex-shrink-0"
                              title="Manage in My Exams"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // DEADLINE CARD
                    if (item.type === "deadline") {
                      return (
                        <div
                          key={item.id}
                          className="bg-surface hover:bg-surface-elevated border border-border border-l-4 border-l-sky-500 rounded-2xl p-4 sm:p-5 shadow-sm group transition-all"
                        >
                          <div className="flex items-start gap-3.5">
                            {/* Complete Circle Button */}
                            <button
                              type="button"
                              onClick={() => onToggleDeadline(originalDeadlineId)}
                              className="mt-0.5 w-6 h-6 rounded-full border-2 border-border hover:border-sky-500 bg-surface-subtle hover:bg-sky-500/15 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 group/chk focus:outline-none"
                              aria-label={`Mark "${item.title}" complete`}
                              title="Mark complete"
                            >
                              <span className="w-2 h-2 rounded-full bg-transparent group-hover/chk:bg-sky-500/60 transition-colors" />
                            </button>

                            <div className="min-w-0 flex-1">
                              {/* Top row */}
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded-md bg-surface-subtle border border-border text-text-secondary text-[10px] font-mono">
                                  {item.subject}
                                </span>
                                {getPriorityBadge(item.importance)}
                              </div>

                              {/* Title */}
                              <h4 className="text-base font-medium text-text-primary tracking-tight group-hover:text-text-primary transition-colors">
                                {item.title}
                              </h4>

                              {/* Due Time */}
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-text-secondary font-mono">
                                <Clock size={12} className="text-sky-500" />
                                <span className="text-text-primary">
                                  Due {item.time ? formatTime12Hour(item.time) : "23:59"}
                                </span>
                              </div>

                              {/* Description snippet */}
                              {item.description && (
                                <p className="text-xs text-text-muted mt-1.5 line-clamp-1">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // CLASS CARD
                    return (
                      <div
                        key={item.id}
                        className="bg-surface hover:bg-surface-elevated border border-border border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-sm group transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-[#a7f3d0] text-[10px] font-mono font-semibold">
                                {item.subject}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-700 dark:text-[#a7f3d0] bg-emerald-500/10 border border-emerald-500/25">
                                CLASS
                              </span>
                            </div>

                            <h4 className="text-base font-medium text-text-primary tracking-tight">
                              {item.title}
                            </h4>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-text-secondary">
                              <span className="flex items-center gap-1.5 font-mono text-text-primary">
                                <Clock size={12} className="text-emerald-500" />
                                <span>
                                  {item.time ? formatTime12Hour(item.time) : ""} -{" "}
                                  {item.endTime ? formatTime12Hour(item.endTime) : ""}
                                </span>
                              </span>

                              {item.room && (
                                <>
                                  <span className="text-text-muted">•</span>
                                  <span className="flex items-center gap-1.5 text-text-secondary">
                                    <MapPin size={12} className="text-sky-500" />
                                    <span>{item.room}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={onOpenTimetableModal}
                            className="p-1.5 text-text-muted hover:text-emerald-500 hover:bg-surface-subtle rounded-xl transition-all cursor-pointer flex-shrink-0"
                            title="Manage Timetable"
                          >
                            <Calendar size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
