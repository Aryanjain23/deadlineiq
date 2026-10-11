import { useState, useEffect, type FormEvent } from "react";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileText,
  Tag,
  AlertCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  EVENT_CATEGORIES,
  CATEGORY_META,
  formatDateIso,
  type CalendarEvent,
  type EventCategory,
} from "@/lib/calendar";
import { nanoid } from "nanoid";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveEvent: (event: CalendarEvent, addToGoogleCalendar?: boolean) => void;
  onDeleteEvent?: (id: string) => void;
  initialDate?: string;
  editingEvent?: CalendarEvent | null;
  isGoogleConnected?: boolean;
}

export default function EventModal({
  isOpen,
  onClose,
  onSaveEvent,
  onDeleteEvent,
  initialDate,
  editingEvent,
  isGoogleConnected = false,
}: EventModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate || formatDateIso(new Date()));
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [category, setCategory] = useState<EventCategory>("Academic");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [syncWithGoogle, setSyncWithGoogle] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title);
      setDate(editingEvent.date);
      setAllDay(Boolean(editingEvent.allDay));
      setStartTime(editingEvent.startTime || "10:00");
      setEndTime(editingEvent.endTime || "11:00");
      setCategory(editingEvent.category || "Academic");
      setLocation(editingEvent.location || "");
      setNotes(editingEvent.notes || "");
      setSyncWithGoogle(Boolean(editingEvent.isGoogleSynced || editingEvent.googleEventId));
    } else {
      setTitle("");
      setDate(initialDate || formatDateIso(new Date()));
      setAllDay(false);
      setStartTime("10:00");
      setEndTime("11:00");
      setCategory("Academic");
      setLocation("");
      setNotes("");
      setSyncWithGoogle(isGoogleConnected);
    }
    setFormError(null);
  }, [editingEvent, initialDate, isOpen, isGoogleConnected]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Please enter an event title.");
      return;
    }
    if (!date) {
      setFormError("Please select a date for the event.");
      return;
    }
    if (!allDay && startTime && endTime && startTime >= endTime) {
      setFormError("End time must be after start time.");
      return;
    }

    const eventData: CalendarEvent = {
      id: editingEvent ? editingEvent.id : `event-${nanoid(8)}`,
      title: title.trim(),
      date,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      category,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      googleEventId: editingEvent?.googleEventId,
      googleCalendarId: editingEvent?.googleCalendarId,
      isGoogleSynced: editingEvent?.isGoogleSynced || (isGoogleConnected && syncWithGoogle),
      createdAt: editingEvent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveEvent(eventData, isGoogleConnected && syncWithGoogle);
    onClose();
  };

  const handleDelete = () => {
    if (editingEvent && onDeleteEvent) {
      onDeleteEvent(editingEvent.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg my-auto rounded-3xl border border-border bg-surface-elevated backdrop-blur-3xl p-6 sm:p-7 shadow-2xl z-10 transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          <X size={15} />
        </button>

        <div className="pb-4 border-b border-border mb-5">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono tracking-widest text-primary uppercase mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>CALENDAR EVENT</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
            {editingEvent ? "Edit Event" : "Create Event"}
          </h3>
        </div>

        {formError && (
          <div className="mb-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-mono">
            <AlertCircle size={14} className="flex-shrink-0 text-rose-500" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter event title"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface-subtle text-text-primary text-sm focus:outline-none focus:border-primary"
              required
            />
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1.5">
              Category *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {EVENT_CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                const meta = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-2 rounded-xl text-xs font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? `${meta.bgBadge} ${meta.borderColor} font-semibold shadow-xs`
                        : "border-border bg-surface-subtle text-text-muted hover:text-text-primary hover:bg-surface"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & All Day */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                Date *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface-subtle text-text-primary text-xs focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="pb-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded border-border bg-surface text-primary focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-mono text-text-secondary">All-day event</span>
              </label>
            </div>
          </div>

          {/* Times (if not all day) */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-subtle text-text-primary text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-surface-subtle text-text-primary text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
              Location (Optional)
            </label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3 text-text-muted" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter location (optional)"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface-subtle text-text-primary text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-mono text-text-secondary uppercase mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes (optional)"
              className="w-full px-3 py-2 rounded-xl border border-border bg-surface-subtle text-text-primary text-xs focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Google Calendar Sync Option */}
          {isGoogleConnected && (
            <div className="p-3 rounded-2xl border border-border bg-surface flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#4285F4]/20 border border-[#4285F4]/30 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4H19ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"
                      fill="#4285F4"
                    />
                  </svg>
                </div>
                <div>
                  <span className="text-xs font-mono font-medium text-text-primary block">
                    {editingEvent?.googleEventId
                      ? "Sync with Google Calendar"
                      : "Add to Google Calendar"}
                  </span>
                  <span className="text-[10px] text-text-muted font-sans">
                    {editingEvent?.googleEventId
                      ? "Updates will sync to your primary Google Calendar"
                      : "Create this event in your primary Google Calendar"}
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncWithGoogle}
                  onChange={(e) => setSyncWithGoogle(e.target.checked)}
                  className="rounded border-border bg-surface text-[#4285F4] focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            {editingEvent && onDeleteEvent ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl border border-primary/40 bg-gradient-to-r from-sky-500 to-sky-600 dark:from-[#8be0f8] dark:to-[#60caea] text-white dark:text-[#061520] font-semibold text-xs hover:brightness-105 transition-all shadow-[0_0_16px_rgba(2,132,199,0.25)] dark:shadow-[0_0_16px_rgba(118,216,251,0.3)] cursor-pointer"
              >
                {editingEvent ? "Save Changes" : "+ Add Event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
