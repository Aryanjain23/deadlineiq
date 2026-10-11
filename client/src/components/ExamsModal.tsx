import { useState, type FormEvent } from "react";
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Clock,
  BookOpen,
  MapPin,
  Sparkles,
  RotateCcw,
  Check,
  Edit2,
  AlertCircle,
  GraduationCap,
  Flame,
  FileText,
  Building,
} from "lucide-react";
import {
  EXAM_TYPES,
  sortExamsChronologically,
  formatTime12Hour,
  formatExamDateDisplay,
  getDaysUntil,
  getRelativeTimeDescription,
  type Exam,
  type ExamType,
} from "@/lib/exams";
import type { TimetableEntry } from "@/lib/timetable";
import { nanoid } from "nanoid";
import AiExamImportModal from "./AiExamImportModal";

interface ExamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: Exam[];
  onUpdateExams: (exams: Exam[]) => Promise<void> | void;
  timetable?: TimetableEntry[];
}

const COMMON_START_TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
];

export default function ExamsModal({
  isOpen,
  onClose,
  exams,
  onUpdateExams,
  timetable = [],
}: ExamsModalProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [subject, setSubject] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [examDate, setExamDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [examType, setExamType] = useState<ExamType>("Internal");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const sortedExams = sortExamsChronologically(exams);

  // Find unique subject names from timetable for quick pills
  const timetableSubjects = Array.from(
    new Set(timetable.map((t) => t.subject.trim()))
  ).filter(Boolean);

  const resetForm = () => {
    setSubject("");
    setSubjectCode("");
    setExamDate("");
    setStartTime("10:00");
    setEndTime("11:30");
    setExamType("Internal");
    setRoom("");
    setNotes("");
    setFormError(null);
    setIsAdding(false);
    setEditingId(null);
    setIsSaving(false);
  };

  const handleStartEdit = (item: Exam) => {
    setSubject(item.subject);
    setSubjectCode(item.subjectCode || "");
    setExamDate(item.examDate);
    setStartTime(item.startTime);
    setEndTime(item.endTime || "");
    setExamType(item.examType);
    setRoom(item.room || "");
    setNotes(item.notes || "");
    setEditingId(item.id);
    setIsAdding(true);
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setFormError("Please enter a subject name.");
      return;
    }
    if (!examDate) {
      setFormError("Please select an exam date.");
      return;
    }
    if (!startTime) {
      setFormError("Please select a start time.");
      return;
    }
    if (endTime && startTime >= endTime) {
      setFormError("End time must be after start time.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const updated = exams.map((ex) =>
          ex.id === editingId
            ? {
                ...ex,
                subject: subject.trim(),
                subjectCode: subjectCode.trim() || undefined,
                examDate,
                startTime,
                endTime: endTime.trim() || undefined,
                examType,
                room: room.trim() || undefined,
                notes: notes.trim() || undefined,
              }
            : ex
        );
        await onUpdateExams(updated);
      } else {
        const newExam: Exam = {
          id: `exam-${nanoid(8)}`,
          subject: subject.trim(),
          subjectCode: subjectCode.trim() || undefined,
          examDate,
          startTime,
          endTime: endTime.trim() || undefined,
          examType,
          room: room.trim() || undefined,
          notes: notes.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        await onUpdateExams([...exams, newExam]);
      }

      resetForm();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save exam to cloud.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onUpdateExams(exams.filter((ex) => ex.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      console.warn("Delete exam error:", err);
    }
  };

  const handleClearAllExams = async () => {
    if (window.confirm("Clear all exams from your schedule?")) {
      try {
        await onUpdateExams([]);
        resetForm();
      } catch (err) {
        console.warn("Clear all exams error:", err);
      }
    }
  };

  // Identify nearest upcoming exam
  const nearestUpcoming = sortedExams.find((ex) => getDaysUntil(ex.examDate) >= 0) || sortedExams[0];

  const getExamTypeColor = (type: ExamType) => {
    switch (type) {
      case "SEE":
        return {
          badge: "bg-[#fb7185]/20 text-[#fca5a5] border-[#fb7185]/40",
          glow: "glass-glow-critical",
        };
      case "Internal":
        return {
          badge: "bg-[#76d8fb]/20 text-[#bae6fd] border-[#76d8fb]/40",
          glow: "glass-glow-medium",
        };
      case "Lab":
      case "Practical":
        return {
          badge: "bg-[#75d5b0]/20 text-[#a7f3d0] border-[#75d5b0]/40",
          glow: "glass-glow-low",
        };
      case "Quiz":
        return {
          badge: "bg-[#fbaf72]/20 text-[#fed7aa] border-[#fbaf72]/40",
          glow: "glass-glow-high",
        };
      default:
        return {
          badge: "bg-white/[0.08] text-[#cbd5e1] border-white/[0.15]",
          glow: "",
        };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Exam Timetable"
    >
      {/* Liquid Backdrop Blur */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl transition-opacity animate-in fade-in duration-300"
        onClick={() => {
          resetForm();
          onClose();
        }}
      />

      {/* Main Modal Panel */}
      <div className="relative w-full max-w-4xl bg-surface-elevated border border-border rounded-3xl shadow-2xl z-10 overflow-hidden my-auto max-h-[92vh] flex flex-col transition-colors">
        {/* Subtle Ambient Sheen */}
        <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-[#86dcff]/10 rounded-full blur-[100px] opacity-40 dark:opacity-100" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 bg-[#c0adff]/10 rounded-full blur-[100px] opacity-40 dark:opacity-100" />

        {/* Modal Header */}
        <div className="relative z-10 px-5 sm:px-8 py-4 sm:py-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 flex-shrink-0 bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-xs flex-shrink-0">
              <GraduationCap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif] tracking-tight">
                  My Exams
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-amber-500/15 text-amber-700 dark:text-[#fbaf72] border border-amber-500/30 font-semibold">
                  {exams.length} SCHEDULED
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5 font-normal">
                Academic examination schedule & hall allocation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {!isAdding && (
              <button
                type="button"
                onClick={() => setIsAiImportOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
                title="Import exam timetable with AI (PDF or Image)"
              >
                <Sparkles size={14} className="text-amber-500" />
                <span>Import with AI</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isAdding) {
                  resetForm();
                } else {
                  setIsAdding(true);
                }
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 flex-shrink-0 ${
                isAdding
                  ? "bg-surface text-text-secondary border border-border hover:bg-surface-elevated"
                  : "bg-gradient-to-r from-[#fbaf72] to-[#f97316] text-[#1c1003] hover:brightness-105"
              }`}
            >
              {isAdding ? (
                <>
                  <X size={14} />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus size={14} strokeWidth={2} />
                  <span>Add Exam</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
          {/* ================================================== */}
          {/* ADD / EDIT EXAM FORM                              */}
          {/* ================================================== */}
          {isAdding && (
            <div className="rounded-2xl p-5 sm:p-6 border border-amber-500/30 bg-surface shadow-lg animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(251,175,114,0.8)]" />
                  <h4 className="text-sm font-semibold text-text-primary font-mono uppercase tracking-wider">
                    {editingId ? "Edit Examination" : "Add Upcoming Examination"}
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-text-muted">
                  CHRONOLOGICAL
                </span>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Subject suggestion pills from timetable */}
              {timetableSubjects.length > 0 && !editingId && (
                <div className="mb-4">
                  <span className="text-[11px] font-mono text-text-muted block mb-1.5">
                    Quick Fill from Timetable:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {timetableSubjects.map((subName) => (
                      <button
                        key={subName}
                        type="button"
                        onClick={() => {
                          setSubject(subName);
                          // Auto fill subject code if available
                          const match = timetable.find((t) => t.subject === subName);
                          if (match?.subjectCode) setSubjectCode(match.subjectCode);
                          if (match?.room) setRoom(match.room);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all cursor-pointer ${
                          subject === subName
                            ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-[#fed7aa] font-semibold"
                            : "bg-surface border-border text-text-secondary hover:border-accent hover:text-text-primary"
                        }`}
                      >
                        + {subName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Subject Name */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Subject Name *
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter subject"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-sans"
                      required
                    />
                  </div>

                  {/* Subject Code */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Subject Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={subjectCode}
                      onChange={(e) => setSubjectCode(e.target.value)}
                      placeholder="Enter subject code (optional)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Exam Date */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Exam Date *
                    </label>
                    <input
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-mono"
                      required
                    />
                  </div>

                  {/* Start Time */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-mono"
                      required
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      End Time (Optional)
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Exam Type */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Exam Type *
                    </label>
                    <select
                      value={examType}
                      onChange={(e) => setExamType(e.target.value as ExamType)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-mono cursor-pointer"
                    >
                      {EXAM_TYPES.map((type) => (
                        <option key={type} value={type} className="bg-surface-elevated text-text-primary">
                          {type} Exam
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Room / Hall */}
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1.5">
                      Room / Hall (Optional)
                    </label>
                    <input
                      type="text"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      placeholder="Enter room or hall (optional)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-mono text-text-secondary mb-1.5">
                    Notes / Syllabus Details (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add syllabus or notes (optional)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-all font-sans"
                  />
                </div>

                {/* Submit Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary bg-surface hover:bg-surface-elevated transition-colors cursor-pointer border border-border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-semibold text-[#1c1003] bg-gradient-to-r from-[#fbaf72] to-[#f97316] hover:brightness-105 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Check size={14} />
                    <span>{editingId ? "Save Changes" : "+ Add to Exam Schedule"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================== */}
          {/* CHRONOLOGICAL EXAMS LIST                           */}
          {/* ================================================== */}
          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(251,175,114,0.8)]" />
                <h4 className="text-xs font-mono text-text-secondary uppercase tracking-wider font-semibold">
                  UPCOMING EXAMINATIONS (CHRONOLOGICAL)
                </h4>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                SORTED BY DATE & TIME
              </span>
            </div>

            {sortedExams.length === 0 ? (
              <div className="rounded-2xl p-10 text-center border border-dashed border-border bg-surface-subtle">
                <GraduationCap size={32} className="mx-auto text-text-muted mb-3" />
                <h5 className="text-base font-medium text-text-primary font-['Space_Grotesk',sans-serif]">
                  No exams scheduled yet
                </h5>
                <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
                  Click "+ Add Exam" above to add upcoming assessments to your Academic Radar.
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-5 px-4 py-2 rounded-xl text-xs font-semibold text-[#1c1003] bg-[#fbaf72] hover:bg-[#fed7aa] transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>Add First Exam</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {sortedExams.map((item, index) => {
                  const { dayNum, monthShort, fullDate, dayOfWeek } = formatExamDateDisplay(item.examDate);
                  const daysUntil = getDaysUntil(item.examDate);
                  const isNearest = item.id === nearestUpcoming?.id;
                  const timeFormatted = item.endTime
                    ? `${formatTime12Hour(item.startTime)} - ${formatTime12Hour(item.endTime)}`
                    : formatTime12Hour(item.startTime);
                  const typeColors = getExamTypeColor(item.examType);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-all duration-300 border border-border ${
                        isNearest
                          ? "border-amber-500/50 bg-amber-500/5 dark:bg-[#1c140a]/90 shadow-sm"
                          : "bg-surface hover:bg-surface-elevated"
                      }`}
                    >
                      {/* Left: Date Block & Exam Details */}
                      <div className="flex items-start sm:items-center gap-4 min-w-0">
                        {/* Big Date Badge (Prompt Style: 28 SEP) */}
                        <div
                          className={`w-16 sm:w-18 h-16 sm:h-18 rounded-2xl border flex flex-col items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
                            isNearest
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-[#fed7aa]"
                              : "bg-surface-subtle border-border text-text-primary"
                          }`}
                        >
                          <span className="text-xl sm:text-2xl font-bold font-['Space_Grotesk',sans-serif] leading-none tracking-tight">
                            {dayNum}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-mono font-semibold tracking-wider mt-1 text-[#ea580c] dark:text-[#fbaf72]">
                            {monthShort}
                          </span>
                          <span className="text-[9px] text-text-muted font-mono leading-none mt-0.5">
                            {dayOfWeek}
                          </span>
                        </div>

                        {/* Subject & Timing */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-base sm:text-lg font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] group-hover:text-accent transition-colors">
                              {item.subject}
                            </h5>

                            {item.subjectCode && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-surface-subtle border border-border text-text-muted">
                                {item.subjectCode}
                              </span>
                            )}

                            {/* Exam Type Badge */}
                            <span
                              className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${typeColors.badge}`}
                            >
                              {item.examType.toUpperCase()} EXAM
                            </span>

                            {/* Nearest Spotlight Badge */}
                            {isNearest && (
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-900 shadow-xs flex items-center gap-1 animate-pulse">
                                <Flame size={10} />
                                NEXT EXAM
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-text-secondary">
                            {/* Time */}
                            <span className="flex items-center gap-1.5 font-mono text-text-primary">
                              <Clock size={12} className="text-[#ea580c] dark:text-[#fbaf72]" />
                              <span>{timeFormatted}</span>
                            </span>

                            {/* Room */}
                            {item.room && (
                              <>
                                <span className="text-border">•</span>
                                <span className="flex items-center gap-1.5 text-text-secondary">
                                  <MapPin size={12} className="text-accent" />
                                  <span>{item.room}</span>
                                </span>
                              </>
                            )}

                            {/* Countdown text */}
                            <span className="text-border">•</span>
                            <span
                              className={`font-mono text-[11px] font-medium ${
                                daysUntil === 0
                                  ? "text-rose-500 font-bold"
                                  : daysUntil === 1
                                  ? "text-amber-500"
                                  : "text-emerald-600 dark:text-[#75d5b0]"
                              }`}
                            >
                              {getRelativeTimeDescription(item.examDate)}
                            </span>
                          </div>

                          {/* Notes if provided */}
                          {item.notes && (
                            <p className="text-xs text-text-muted mt-1.5 line-clamp-1 italic">
                              "{item.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-text-muted hover:text-text-primary hover:bg-surface-subtle border border-transparent hover:border-border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer shadow-xs"
                          title="Delete examination"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="relative z-10 px-6 sm:px-8 py-4 border-t border-border flex items-center justify-between flex-shrink-0 bg-surface/50">
          <button
            type="button"
            onClick={handleClearAllExams}
            className="text-[11px] font-mono text-text-muted hover:text-amber-500 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Clear All Exams</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-medium text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all cursor-pointer active:scale-95 shadow-xs"
          >
            Done
          </button>
        </div>
      </div>

      {/* AI Exam Timetable Import Modal */}
      <AiExamImportModal
        isOpen={isAiImportOpen}
        onClose={() => setIsAiImportOpen(false)}
        existingExams={exams}
        onImportExams={(updated) => {
          onUpdateExams(updated);
        }}
      />
    </div>
  );
}
