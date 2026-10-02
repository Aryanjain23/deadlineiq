import { useState } from "react";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileText,
  Tag,
  Edit2,
  Trash2,
  CheckCircle2,
  Flame,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import {
  CATEGORY_META,
  type UnifiedCalendarItem,
  type CalendarEvent,
} from "@/lib/calendar";
import { formatTime12Hour } from "@/lib/timetable";

interface EventDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: UnifiedCalendarItem | null;
  onEditEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (id: string) => void;
  onToggleDeadline?: (id: string) => void;
  onDeleteGoogleEvent?: (calendarId: string, googleEventId: string) => Promise<void>;
}

export default function EventDetailsModal({
  isOpen,
  onClose,
  item,
  onEditEvent,
  onDeleteEvent,
  onToggleDeadline,
  onDeleteGoogleEvent,
}: EventDetailsModalProps) {
  const [isConfirmingGoogleDelete, setIsConfirmingGoogleDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !item) return null;

  const isDeadline = item.itemType === "deadline";
  const isGoogle = item.itemType === "google" || Boolean(item.isGoogleEvent);
  const deadline = item.deadlineData;
  const meta = CATEGORY_META[item.category] || CATEGORY_META.Other;

  const handleDeleteGoogle = async () => {
    if (!item.googleCalendarId || !item.googleEventId || !onDeleteGoogleEvent) return;
    setIsDeleting(true);
    try {
      await onDeleteGoogleEvent(item.googleCalendarId, item.googleEventId);
      setIsConfirmingGoogleDelete(false);
      onClose();
    } finally {
      setIsDeleting(false);
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
      <div className="relative w-full max-w-md my-auto rounded-3xl border border-border bg-surface-elevated backdrop-blur-3xl p-6 sm:p-7 shadow-2xl z-10 transition-colors">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full border border-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-subtle flex items-center justify-center transition-all cursor-pointer shadow-xs"
        >
          <X size={15} />
        </button>

        {/* Header Badge */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isDeadline ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-[#bae6fd] font-semibold uppercase flex items-center gap-1.5">
              <Clock size={11} className="text-[#0284c7] dark:text-[#76d8fb]" />
              DEADLINE
            </span>
          ) : isGoogle ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border border-[#4285F4]/40 bg-[#4285F4]/15 text-[#4285F4] dark:text-[#93bbf8] font-semibold uppercase flex items-center gap-1.5">
              {/* Google G icon */}
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none">
                <path
                  d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4H19ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"
                  fill="#4285F4"
                />
              </svg>
              GOOGLE CALENDAR
            </span>
          ) : (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider border ${meta.borderColor} ${meta.bgBadge} font-semibold uppercase flex items-center gap-1.5 shadow-xs`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
              {item.category} EVENT
            </span>
          )}

          {item.isGoogleSynced && !isGoogle && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[#4285F4]/10 text-[#93bbf8] border border-[#4285F4]/30">
              Synced with Google
            </span>
          )}

          {isDeadline && deadline && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase ${
                deadline.completed
                  ? "bg-[#75d5b0]/15 text-[#a7f3d0] border border-[#75d5b0]/30"
                  : deadline.importance === "CRITICAL"
                  ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold"
                  : deadline.importance === "HIGH"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "bg-white/10 text-white/80 border border-white/15"
              }`}
            >
              {deadline.completed ? "COMPLETED" : `${deadline.importance} PRIORITY`}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] pr-8">
          {item.title}
        </h3>

        {/* Meta details list */}
        <div className="space-y-3 my-5 py-4 border-y border-border text-xs font-mono">
          {/* Date */}
          <div className="flex items-center gap-3 text-text-secondary">
            <Calendar size={15} className="text-[#0284c7] dark:text-[#76d8fb] flex-shrink-0" />
            <span>
              {new Date(`${item.date}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          {/* Time */}
          <div className="flex items-center gap-3 text-text-secondary">
            <Clock size={15} className="text-[#ea580c] dark:text-[#fbaf72] flex-shrink-0" />
            <span>
              {item.allDay
                ? "All-day event"
                : item.startTime
                ? `${formatTime12Hour(item.startTime)}${
                    item.endTime ? ` – ${formatTime12Hour(item.endTime)}` : ""
                  }`
                : "No specific time"}
            </span>
          </div>

          {/* Location or Subject */}
          {item.location && (
            <div className="flex items-center gap-3 text-text-secondary">
              <MapPin size={15} className="text-[#059669] dark:text-[#75d5b0] flex-shrink-0" />
              <span>{item.location}</span>
            </div>
          )}

          {/* Notes or Description */}
          {item.notes && (
            <div className="flex items-start gap-3 text-text-muted pt-1 leading-relaxed">
              <FileText size={15} className="text-[#7c3aed] dark:text-[#a895ff] flex-shrink-0 mt-0.5" />
              <p className="font-sans text-xs whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}

          {/* External Google Calendar Link */}
          {item.htmlLink && (
            <div className="flex items-center gap-2 pt-1">
              <ExternalLink size={13} className="text-[#4285F4]" />
              <a
                href={item.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2563eb] dark:text-[#93bbf8] hover:underline underline-offset-2 transition-colors font-mono"
              >
                View in Google Calendar
              </a>
            </div>
          )}
        </div>

        {/* User Confirmation Dialog for Destructive Google Calendar Deletion */}
        {isConfirmingGoogleDelete && (
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 mb-4 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-200">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-800 dark:text-rose-300">Delete from Google Calendar?</p>
                <p className="text-[11px] text-rose-700/80 dark:text-rose-200/80 mt-0.5">
                  Are you sure you want to permanently delete "{item.title}" from your Google Calendar?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingGoogleDelete(false)}
                className="px-3 py-1.5 rounded-xl border border-border text-xs font-mono text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteGoogle}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-mono font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1">
          {isDeadline ? (
            <div className="flex items-center justify-between w-full">
              {onToggleDeadline && deadline ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggleDeadline(deadline.id);
                    onClose();
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
                    deadline.completed
                      ? "border border-border bg-surface text-text-muted hover:text-text-primary"
                      : "border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-[#a7f3d0] hover:bg-emerald-500/25 font-semibold"
                  }`}
                >
                  <CheckCircle2 size={14} />
                  <span>{deadline.completed ? "Mark Incomplete" : "Mark Complete"}</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : isGoogle ? (
            <div className="flex items-center justify-between w-full">
              {onDeleteGoogleEvent && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingGoogleDelete(true)}
                  className="px-3.5 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                {onEditEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      onEditEvent({
                        id: item.id,
                        title: item.title,
                        date: item.date,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        category: item.category,
                        location: item.location,
                        notes: item.notes,
                        allDay: item.allDay,
                        googleEventId: item.googleEventId,
                        googleCalendarId: item.googleCalendarId,
                        isGoogleSynced: true,
                      });
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-elevated text-text-primary text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-[#4285F4]/40 bg-[#4285F4] text-white font-medium text-xs hover:brightness-110 transition-all cursor-pointer shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              {onDeleteEvent ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteEvent(item.id);
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                {onEditEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      onEditEvent({
                        id: item.id,
                        title: item.title,
                        date: item.date,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        category: item.category,
                        location: item.location,
                        notes: item.notes,
                        allDay: item.allDay,
                        googleEventId: item.googleEventId,
                        googleCalendarId: item.googleCalendarId,
                        isGoogleSynced: item.isGoogleSynced,
                      });
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-elevated text-text-primary text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-[#76d8fb]/40 bg-[#76d8fb] text-[#061520] font-semibold text-xs hover:brightness-105 transition-all cursor-pointer shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
