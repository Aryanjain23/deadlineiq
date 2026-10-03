import { useState, useMemo, type FormEvent } from "react";
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
  User,
  ArrowRight,
} from "lucide-react";
import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type TimetableEntry,
  formatTime12Hour,
  getNextUpcomingClass,
} from "@/lib/timetable";
import { nanoid } from "nanoid";
import AiTimetableImportModal from "./AiTimetableImportModal";

interface TimetableModalProps {
  isOpen: boolean;
  onClose: () => void;
  timetable: TimetableEntry[];
  onUpdateTimetable: (entries: TimetableEntry[]) => void;
}

const TIME_OPTIONS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00",
];

export default function TimetableModal({
  isOpen,
  onClose,
  timetable,
  onUpdateTimetable,
}: TimetableModalProps) {
  const currentDayName: DayOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()] as DayOfWeek;

  const [activeDay, setActiveDay] = useState<DayOfWeek>(currentDayName);
  const [viewMode, setViewMode] = useState<"today" | "week" | "day">("today");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);

  // Form State
  const [subject, setSubject] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [day, setDay] = useState<DayOfWeek>(activeDay);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [instructor, setInstructor] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const nextUpcoming = useMemo(() => {
    return getNextUpcomingClass(timetable);
  }, [timetable]);

  const todayClasses = useMemo(() => {
    return timetable
      .filter((e) => e.day === currentDayName)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [timetable, currentDayName]);

  if (!isOpen) return null;

  const resetForm = () => {
    setSubject("");
    setSubjectCode("");
    setDay(activeDay);
    setStartTime("09:00");
    setEndTime("10:00");
    setRoom("");
    setInstructor("");
    setFormError(null);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartEdit = (entry: TimetableEntry) => {
    setSubject(entry.subject);
    setSubjectCode(entry.subjectCode || "");
    setDay(entry.day);
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setRoom(entry.room || "");
    setInstructor(entry.instructor || "");
    setEditingId(entry.id);
    setIsAdding(true);
    setFormError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setFormError("Please enter a subject name.");
      return;
    }

    if (startTime >= endTime) {
      setFormError("End time must be after start time.");
      return;
    }

    if (editingId) {
      const updated = timetable.map((e) =>
        e.id === editingId
          ? {
              ...e,
              subject: subject.trim(),
              subjectCode: subjectCode.trim() || undefined,
              day,
              startTime,
              endTime,
              room: room.trim() || undefined,
              instructor: instructor.trim() || undefined,
            }
          : e
      );
      onUpdateTimetable(updated);
    } else {
      const newEntry: TimetableEntry = {
        id: `entry-${nanoid(8)}`,
        subject: subject.trim(),
        subjectCode: subjectCode.trim() || undefined,
        day,
        startTime,
        endTime,
        room: room.trim() || undefined,
        instructor: instructor.trim() || undefined,
      };
      onUpdateTimetable([...timetable, newEntry]);
    }

    resetForm();
  };

  const handleDelete = (id: string) => {
    const updated = timetable.filter((e) => e.id !== id);
    onUpdateTimetable(updated);
    if (editingId === id) {
      resetForm();
    }
  };

  const handleClearTimetable = () => {
    if (timetable.length === 0) return;
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      return;
    }
    onUpdateTimetable([]);
    setIsConfirmingClear(false);
    resetForm();
  };

  const getEntriesForDay = (targetDay: DayOfWeek) => {
    return timetable
      .filter((e) => e.day === targetDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Deep Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl my-auto rounded-3xl border border-border bg-surface-elevated backdrop-blur-3xl p-6 sm:p-8 shadow-2xl z-10 max-h-[92vh] flex flex-col transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 rounded-full border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition-all cursor-pointer z-20 shadow-xs"
          aria-label="Close dialog"
        >
          <X size={15} />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#0284c7] dark:text-[#76d8fb] uppercase mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7] dark:bg-[#76d8fb]" />
              <span>WEEKLY SCHEDULE · CLASSES</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary font-['Space_Grotesk',sans-serif]">
              My Timetable
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Your recurring weekly class schedule.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {!isAdding && (
              <button
                type="button"
                onClick={() => setIsAiImportOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-primary bg-surface hover:bg-surface-elevated border border-border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
                title="Import timetable with AI (PDF or Image)"
              >
                <Sparkles size={14} className="text-[#0284c7] dark:text-[#76d8fb]" />
                <span>Import with AI</span>
              </button>
            )}

            {isConfirmingClear ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearTimetable}
                  className="text-xs font-mono text-rose-600 dark:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg border border-rose-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Confirm clearing all classes"
                >
                  <Trash2 size={12} />
                  <span>Confirm Clear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                  className="text-xs font-mono text-text-secondary hover:text-text-primary px-2 py-1.5 rounded-lg border border-border hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClearTimetable}
                className="text-xs font-mono text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-elevated flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Clear all timetable classes"
              >
                <RotateCcw size={12} />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isAdding) {
                  resetForm();
                } else {
                  setDay(activeDay);
                  setIsAdding(true);
                }
              }}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0 ${
                isAdding
                  ? "border-border text-text-secondary bg-surface hover:bg-surface-elevated"
                  : "border-[#76d8fb]/40 text-[#07131b] bg-gradient-to-r from-[#9ae4f8] to-[#76d8fb] hover:brightness-105"
              }`}
            >
              {isAdding ? (
                <>
                  <X size={14} />
                  <span>Cancel</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Add Class</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Add / Edit Inline Form */}
        {isAdding && (
          <form
            onSubmit={handleSubmit}
            className="my-4 p-4 sm:p-5 rounded-2xl border border-border bg-surface/90 backdrop-blur-xl shadow-lg space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#0284c7] dark:text-[#76d8fb] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} />
                {editingId ? "Edit Class Schedule" : "Add New Class to Timetable"}
              </span>
              {formError && (
                <span className="text-xs text-rose-500 flex items-center gap-1 font-mono">
                  <AlertCircle size={12} /> {formError}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Subject */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Physics, Mathematics"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />
              </div>

              {/* Code */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Subject Code (Optional)
                </label>
                <input
                  type="text"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  placeholder="e.g. PHY101"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Day */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Day of the Week *
                </label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value as DayOfWeek)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d} className="bg-surface-elevated text-text-primary">
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Time */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Start Time *
                </label>
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t} className="bg-surface-elevated text-text-primary">
                      {formatTime12Hour(t)} ({t})
                    </option>
                  ))}
                </select>
              </div>

              {/* End Time */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  End Time *
                </label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t} className="bg-surface-elevated text-text-primary">
                      {formatTime12Hour(t)} ({t})
                    </option>
                  ))}
                </select>
              </div>

              {/* Room / Location */}
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Classroom / Room (Optional)
                </label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Hall A-102, Lab 3"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Instructor */}
              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Instructor / Lecturer (Optional)
                </label>
                <input
                  type="text"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="e.g. Dr. Ramesh, Prof. Anita"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-elevated text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg border border-[#76d8fb]/40 bg-[#76d8fb] text-[#05111a] font-semibold text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
              >
                {editingId ? "Save Changes" : "+ Save to Timetable"}
              </button>
            </div>
          </form>
        )}

        {/* View Mode Navigation Tabs */}
        <div className="py-3 flex items-center justify-between gap-3 border-b border-border overflow-x-auto">
          <div className="flex items-center gap-1.5 bg-surface p-1 rounded-2xl border border-border">
            <button
              onClick={() => setViewMode("today")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "today"
                  ? "bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-[#bae6fd] shadow-xs font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Today&apos;s Schedule</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-subtle text-text-secondary">
                {todayClasses.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                viewMode === "week"
                  ? "bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-[#bae6fd] shadow-xs font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
              }`}
            >
              Full Week Grid
            </button>

            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                viewMode === "day"
                  ? "bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-[#bae6fd] shadow-xs font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
              }`}
            >
              Day by Day
            </button>
          </div>

          <div className="text-[11px] font-mono text-text-muted hidden sm:block">
            {timetable.length} total class{timetable.length === 1 ? "" : "es"} configured
          </div>
        </div>

        {/* Day Selector for Day view */}
        {viewMode === "day" && (
          <div className="py-2.5 flex items-center gap-1.5 overflow-x-auto border-b border-border">
            {DAYS_OF_WEEK.map((d) => {
              const isToday = d === currentDayName;
              const isSelected = d === activeDay;
              const count = timetable.filter((e) => e.day === d).length;

              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  className={`px-3 py-1 rounded-xl text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "border border-[#76d8fb]/40 bg-[#76d8fb]/15 text-sky-700 dark:text-[#bae6fd] font-semibold shadow-xs"
                      : "border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
                  }`}
                >
                  <span>{d.slice(0, 3)}</span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Today" />
                  )}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-accent/20 text-accent font-semibold" : "bg-surface-subtle text-text-muted"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Timetable Content Body */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[300px]">
          
          {/* ========================================================= */}
          {/* 1. TODAY'S SCHEDULE VIEW                                  */}
          {/* ========================================================= */}
          {viewMode === "today" && (
            <div className="space-y-4">
              
              {/* NEXT CLASS HERO CARD (if one exists) */}
              {nextUpcoming && (
                <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 dark:bg-gradient-to-r dark:from-[#75d5b0]/15 dark:via-[#102720]/80 dark:to-[#0c1815]/90 backdrop-blur-xl shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-800 dark:text-[#a7f3d0] border border-emerald-500/40 font-bold uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      NEXT UPCOMING CLASS
                    </span>
                    <span className="text-xs font-mono text-emerald-700 dark:text-[#a7f3d0]">
                      {nextUpcoming.isToday ? "Today" : nextUpcoming.isTomorrow ? "Tomorrow" : nextUpcoming.dayOfWeek}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
                    <div>
                      <h4 className="text-xl font-semibold text-text-primary tracking-tight">
                        {nextUpcoming.entry.subject}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary mt-1 font-mono">
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-[#86e2be]">
                          <Clock size={12} className="text-emerald-500" />
                          <span>{formatTime12Hour(nextUpcoming.entry.startTime)} – {formatTime12Hour(nextUpcoming.entry.endTime)}</span>
                        </span>
                        {nextUpcoming.entry.room && (
                          <span className="flex items-center gap-1 text-emerald-800 dark:text-[#d1fae5]">
                            <MapPin size={12} className="text-emerald-500" />
                            <span>{nextUpcoming.entry.room}</span>
                          </span>
                        )}
                        {nextUpcoming.entry.instructor && (
                          <span className="flex items-center gap-1 text-sky-700 dark:text-[#93c5fd]">
                            <User size={12} className="text-sky-500" />
                            <span>{nextUpcoming.entry.instructor}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleStartEdit(nextUpcoming.entry)}
                      className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-elevated text-xs font-mono text-text-primary flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Today's Full List */}
              <div className="pt-2">
                <div className="flex items-center justify-between pb-2 mb-2">
                  <h3 className="text-sm font-semibold text-text-primary font-mono tracking-wider uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#76d8fb]" />
                    <span>All Classes for Today ({currentDayName})</span>
                  </h3>
                  <span className="text-xs font-mono text-text-muted">
                    {todayClasses.length} class{todayClasses.length === 1 ? "" : "es"}
                  </span>
                </div>

                {todayClasses.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-surface-subtle">
                    <p className="text-sm text-text-secondary">No classes scheduled for today ({currentDayName}).</p>
                    <p className="text-xs text-text-muted mt-1">Enjoy your study time or check the full weekly schedule.</p>
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <button
                        onClick={() => {
                          setDay(currentDayName);
                          setIsAdding(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs text-sky-700 dark:text-[#76d8fb] border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 font-mono inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={13} /> Add class for today
                      </button>
                      <button
                        onClick={() => setViewMode("week")}
                        className="px-3.5 py-1.5 rounded-xl text-xs text-text-primary border border-border bg-surface hover:bg-surface-elevated font-mono inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <span>View Full Week</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {todayClasses.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-4 rounded-2xl border border-border hover:border-accent/40 bg-surface hover:bg-surface-elevated transition-all flex items-center justify-between group shadow-xs"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-[#76d8fb] flex items-center justify-center font-mono text-xs font-semibold">
                            <Clock size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary text-sm">
                                {entry.subject}
                              </span>
                              {entry.subjectCode && (
                                <span className="px-1.5 py-0.5 rounded bg-surface-subtle border border-border text-[10px] font-mono text-text-muted">
                                  {entry.subjectCode}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary mt-1 font-mono">
                              <span className="text-sky-700 dark:text-[#bae6fd]">
                                {formatTime12Hour(entry.startTime)} – {formatTime12Hour(entry.endTime)}
                              </span>
                              {entry.room && (
                                <span className="flex items-center gap-1 text-text-secondary">
                                  <MapPin size={11} className="text-accent" />
                                  {entry.room}
                                </span>
                              )}
                              {entry.instructor && (
                                <span className="flex items-center gap-1 text-purple-700 dark:text-[#a5b4fc]">
                                  <User size={11} className="text-purple-500" />
                                  {entry.instructor}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStartEdit(entry)}
                            className="p-1.5 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle cursor-pointer shadow-xs"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer shadow-xs"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. DAY-BY-DAY VIEW                                        */}
          {/* ========================================================= */}
          {viewMode === "day" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-base font-semibold text-text-primary font-['Space_Grotesk',sans-serif] flex items-center gap-2">
                  <span>{activeDay} Schedule</span>
                  {activeDay === currentDayName && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-700 dark:text-[#75d5b0] bg-emerald-500/15 border border-emerald-500/30">
                      TODAY
                    </span>
                  )}
                </h3>
                <span className="text-xs font-mono text-text-muted">
                  {getEntriesForDay(activeDay).length} classes scheduled
                </span>
              </div>

              {getEntriesForDay(activeDay).length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-surface-subtle">
                  <p className="text-sm text-text-muted">No classes scheduled for {activeDay}.</p>
                  <button
                    onClick={() => {
                      setDay(activeDay);
                      setIsAdding(true);
                    }}
                    className="mt-3 text-xs text-sky-700 dark:text-[#76d8fb] hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Add class for {activeDay}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {getEntriesForDay(activeDay).map((entry) => (
                    <div
                      key={entry.id}
                      className="p-4 rounded-2xl border border-border hover:border-accent/40 bg-surface hover:bg-surface-elevated transition-all flex items-center justify-between group shadow-xs"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-[#76d8fb] flex items-center justify-center font-mono text-xs font-semibold">
                          <Clock size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary text-sm">
                              {entry.subject}
                            </span>
                            {entry.subjectCode && (
                              <span className="px-1.5 py-0.5 rounded bg-surface-subtle border border-border text-[10px] font-mono text-text-muted">
                                {entry.subjectCode}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary mt-1 font-mono">
                            <span className="text-sky-700 dark:text-[#bae6fd]">
                              {formatTime12Hour(entry.startTime)} – {formatTime12Hour(entry.endTime)}
                            </span>
                            {entry.room && (
                              <span className="flex items-center gap-1 text-text-secondary">
                                <MapPin size={11} className="text-accent" />
                                {entry.room}
                              </span>
                            )}
                            {entry.instructor && (
                              <span className="flex items-center gap-1 text-purple-700 dark:text-[#a5b4fc]">
                                <User size={11} className="text-purple-500" />
                                {entry.instructor}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(entry)}
                          className="p-1.5 rounded-lg border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle cursor-pointer shadow-xs"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 cursor-pointer shadow-xs"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 3. FULL WEEK GRID VIEW                                    */}
          {/* ========================================================= */}
          {viewMode === "week" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {DAYS_OF_WEEK.map((d) => {
                const dayEntries = getEntriesForDay(d);
                const isToday = d === currentDayName;

                return (
                  <div
                    key={d}
                    className={`rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                      isToday
                        ? "border-[#76d8fb]/40 bg-sky-500/5 dark:bg-[#131f31]/70 shadow-sm"
                        : "border-border bg-surface hover:bg-surface-elevated"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-mono font-semibold uppercase tracking-wider ${isToday ? "text-[#0284c7] dark:text-[#76d8fb]" : "text-text-secondary"}`}>
                            {d}
                          </span>
                          {isToday && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-700 dark:text-[#75d5b0] bg-emerald-500/15 border border-emerald-500/30 font-semibold">
                              TODAY
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {dayEntries.length} class{dayEntries.length === 1 ? "" : "es"}
                        </span>
                      </div>

                      {dayEntries.length === 0 ? (
                        <div className="py-6 text-center text-xs text-text-muted font-mono">
                          No classes
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dayEntries.map((e) => (
                            <div
                              key={e.id}
                              className="p-2.5 rounded-xl bg-surface-subtle border border-border hover:border-accent/40 transition-all group/item shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-medium text-xs text-text-primary truncate">
                                  {e.subject}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleStartEdit(e)}
                                    className="p-1 hover:text-accent text-text-muted cursor-pointer"
                                    title="Edit"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(e.id)}
                                    className="p-1 hover:text-rose-500 text-text-muted cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-text-secondary mt-1">
                                <span className="text-sky-700 dark:text-[#bae6fd]">
                                  {e.startTime} - {e.endTime}
                                </span>
                                {e.room && <span>• {e.room}</span>}
                                {e.instructor && (
                                  <span className="text-purple-700 dark:text-[#a5b4fc] truncate">
                                    • {e.instructor}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setDay(d);
                        setIsAdding(true);
                      }}
                      className="mt-3 w-full py-1 rounded-lg border border-dashed border-border hover:border-accent/40 text-[11px] font-mono text-text-muted hover:text-accent flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus size={11} />
                      <span>Add</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AI Timetable Import Modal */}
      <AiTimetableImportModal
        isOpen={isAiImportOpen}
        onClose={() => setIsAiImportOpen(false)}
        existingTimetable={timetable}
        onImportTimetable={(updated) => {
          onUpdateTimetable(updated);
        }}
      />
    </div>
  );
}
