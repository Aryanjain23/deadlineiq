import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Sparkles,
  ArrowLeft,
  Filter,
  CheckCircle2,
  CalendarDays,
  Layers,
  BookOpen,
  User,
  GraduationCap,
  AlertTriangle,
  X,
  ExternalLink,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatDateIso,
  formatMonthYearTitle,
  getMonthMatrix,
  getWeekDays,
  buildUnifiedCalendarItems,
  EVENT_CATEGORIES,
  CATEGORY_META,
  type CalendarEvent,
  type EventCategory,
  type UnifiedCalendarItem,
} from "@/lib/calendar";
import {
  subscribeToEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  subscribeToDeadlines,
  updateDeadline,
  subscribeToTimetable,
} from "@/lib/services";
import type { Deadline } from "@/lib/deadlines";
import type { TimetableEntry, DayOfWeek } from "@/lib/timetable";
import { formatTime12Hour } from "@/lib/timetable";
import {
  isGoogleCalendarConfigured,
  requestGoogleCalendarAccess,
  disconnectGoogleCalendar,
  fetchGoogleCalendarList,
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarMeta,
  saveGoogleCalendarMeta,
  getGoogleAccessToken,
  type GoogleCalendarMeta,
  type GoogleSyncStatus,
  type GoogleCalendarError,
} from "@/lib/googleCalendar";
import { getValidGoogleAccessToken } from "@/lib/googleAuth";
import EventModal from "@/components/EventModal";
import EventDetailsModal from "@/components/EventDetailsModal";
import TimetableModal from "@/components/TimetableModal";
import GoogleCalendarModal from "@/components/GoogleCalendarModal";
import ThemeToggle from "@/components/ThemeToggle";

export default function CalendarPage() {
  const [, setLocation] = useLocation();
  const { user: authUser, isLoading: isAuthLoading, logout } = useAuth();
  const currentUser = authUser;

  // View state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Data states
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);

  // Google Calendar state
  const userUid =
    currentUser?.uid || (currentUser?.usn ? `usn_${currentUser.usn}` : "guest");
  const [googleMeta, setGoogleMeta] = useState<GoogleCalendarMeta>(() =>
    getGoogleCalendarMeta(userUid)
  );
  const [googleSyncStatus, setGoogleSyncStatus] = useState<GoogleSyncStatus>("idle");
  const [googleError, setGoogleError] = useState<GoogleCalendarError | null>(null);
  const [googleEvents, setGoogleEvents] = useState<UnifiedCalendarItem[]>([]);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const isGoogleConfigured = isGoogleCalendarConfigured();

  // Modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [selectedDateForNewEvent, setSelectedDateForNewEvent] = useState<string>(
    formatDateIso(new Date())
  );
  const [selectedItemForDetails, setSelectedItemForDetails] =
    useState<UnifiedCalendarItem | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Authentication check & Firestore subscription
  useEffect(() => {
    if (isAuthLoading) return;
    if (!currentUser) {
      setLocation("/login");
      return;
    }

    const unsubEvents = subscribeToEvents(userUid, (items) => {
      setEvents(items);
    }, userUid);

    const unsubDeadlines = subscribeToDeadlines(userUid, (items) => {
      setDeadlines(items);
    }, userUid);

    const unsubTimetable = subscribeToTimetable(userUid, (items) => {
      setTimetable(items);
    }, userUid);

    return () => {
      unsubEvents();
      unsubDeadlines();
      unsubTimetable();
    };
  }, [currentUser, isAuthLoading, setLocation, userUid]);

  // Synchronize Google Calendar Events
  const syncGoogleCalendarEvents = useCallback(
    async (token: string, metaToUse: GoogleCalendarMeta, baseDate: Date) => {
      setGoogleSyncStatus("syncing");
      setGoogleError(null);
      try {
        const y = baseDate.getFullYear();
        const m = baseDate.getMonth();
        // Fetch 3-month window around currently navigated month
        const timeMin = new Date(y, m - 1, 1).toISOString();
        const timeMax = new Date(y, m + 2, 0, 23, 59, 59).toISOString();

        const selectedIds =
          metaToUse.selectedCalendarIds && metaToUse.selectedCalendarIds.length > 0
            ? metaToUse.selectedCalendarIds
            : ["primary"];

        const allItems: UnifiedCalendarItem[] = [];
        for (const calId of selectedIds) {
          const calObj = metaToUse.calendars.find((c) => c.id === calId);
          const calName =
            calObj?.summary || (calId === "primary" ? "Primary Calendar" : "Google Calendar");
          const items = await fetchGoogleCalendarEvents(
            token,
            calId,
            timeMin,
            timeMax,
            calName
          );
          allItems.push(...items);
        }

        setGoogleEvents(allItems);
        setGoogleSyncStatus("success");
        const updatedMeta = {
          ...metaToUse,
          lastSyncTime: new Date().toISOString(),
        };
        setGoogleMeta(updatedMeta);
        saveGoogleCalendarMeta(userUid, updatedMeta);
      } catch (err: any) {
        console.warn("Google Calendar sync warning:", err);
        setGoogleSyncStatus(err.type === "expired" ? "expired" : "error");
        setGoogleError(err);
      }
    },
    [userUid]
  );

  // Auto-sync Google Calendar on calendar mount or navigated month change
  useEffect(() => {
    if (!currentUser || !googleMeta.isConnected) return;
    let isCancelled = false;

    async function ensureSync() {
      try {
        const token = await getValidGoogleAccessToken(userUid, "calendar");
        if (isCancelled) return;
        if (token) {
          syncGoogleCalendarEvents(token, googleMeta, currentDate);
        } else {
          // Token absent and refresh not possible without user interaction
          setGoogleSyncStatus("expired");
          setGoogleError({
            type: "expired",
            message: "Google Calendar authorization session ended. Click to reconnect.",
          });
        }
      } catch (err: any) {
        if (!isCancelled) {
          setGoogleSyncStatus("error");
          setGoogleError({
            type: "network",
            message: "Could not sync Google Calendar. Local events and deadlines are unaffected.",
          });
        }
      }
    }

    ensureSync();
    return () => {
      isCancelled = true;
    };
  }, [googleMeta.isConnected, currentDate.getMonth(), currentDate.getFullYear(), currentUser, userUid, syncGoogleCalendarEvents]);

  // Connect Google Calendar flow
  const handleConnectGoogleCalendar = async () => {
    setGoogleSyncStatus("connecting");
    setGoogleError(null);
    try {
      const { accessToken } = await requestGoogleCalendarAccess(userUid);
      let calendars = [];
      try {
        calendars = await fetchGoogleCalendarList(accessToken);
      } catch (e) {
        console.warn("Fallback to primary calendar:", e);
        calendars = [{ id: "primary", summary: "Primary Calendar", primary: true }];
      }

      const newMeta: GoogleCalendarMeta = {
        isConnected: true,
        selectedCalendarIds: ["primary"],
        calendars,
        lastSyncTime: new Date().toISOString(),
      };

      setGoogleMeta(newMeta);
      saveGoogleCalendarMeta(userUid, newMeta);
      await syncGoogleCalendarEvents(accessToken, newMeta, currentDate);
      setIsGoogleModalOpen(false);
    } catch (err: any) {
      console.warn("Google Calendar connect error:", err);
      const rawMsg = err?.message || "";
      const friendlyMessage = rawMsg.includes("not found (404)") || rawMsg.includes("failed (500)")
        ? rawMsg
        : rawMsg.includes("GOOGLE_CLIENT_SECRET")
        ? "Google credentials require configuration. Check Settings -> Google Setup Check to view setup status."
        : rawMsg.includes("popup") || rawMsg.includes("cancelled")
        ? "Google authorization was cancelled. Click Retry to connect."
        : rawMsg || "Google Calendar sync paused.";

      setGoogleSyncStatus(err.type === "denied" ? "idle" : "error");
      setGoogleError({
        type: err.type || "unknown",
        message: friendlyMessage,
      });
      const updated = getGoogleCalendarMeta(userUid);
      setGoogleMeta(updated);
    }
  };

  // Disconnect Google Calendar flow (preserves all DeadlineIQ events)
  const handleDisconnectGoogleCalendar = async () => {
    await disconnectGoogleCalendar(userUid);
    const updated = getGoogleCalendarMeta(userUid);
    setGoogleMeta(updated);
    setGoogleEvents([]);
    setGoogleSyncStatus("idle");
    setGoogleError(null);
  };

  // Sync Now manual trigger
  const handleSyncNow = async () => {
    const token = getGoogleAccessToken();
    if (token) {
      await syncGoogleCalendarEvents(token, googleMeta, currentDate);
    } else {
      await handleConnectGoogleCalendar();
    }
  };

  // Toggle calendar selection in modal
  const handleToggleCalendar = (calendarId: string) => {
    const currentSelected = googleMeta.selectedCalendarIds || ["primary"];
    const isAlready = currentSelected.includes(calendarId);
    let nextSelected: string[];
    if (isAlready) {
      if (currentSelected.length === 1) return;
      nextSelected = currentSelected.filter((id) => id !== calendarId);
    } else {
      nextSelected = [...currentSelected, calendarId];
    }
    const updated = { ...googleMeta, selectedCalendarIds: nextSelected };
    setGoogleMeta(updated);
    saveGoogleCalendarMeta(userUid, updated);
    const token = getGoogleAccessToken();
    if (token) {
      syncGoogleCalendarEvents(token, updated, currentDate);
    }
  };

  // Delete event originating from Google Calendar
  const handleDeleteGoogleCalendarEvent = async (calendarId: string, googleEventId: string) => {
    const token = getGoogleAccessToken();
    if (!token) {
      setGoogleError({
        type: "expired",
        message: "Google Calendar authorization expired. Please reconnect.",
      });
      return;
    }
    try {
      await deleteGoogleCalendarEvent(token, calendarId, googleEventId);
      setGoogleEvents((prev) => prev.filter((g) => g.googleEventId !== googleEventId));
    } catch (err: any) {
      console.warn("Failed to delete Google Calendar event:", err);
      setGoogleError(err);
      throw err;
    }
  };

  // Unified items (events + existing deadlines + google events, with deduplication)
  const unifiedItems = useMemo(() => {
    return buildUnifiedCalendarItems(events, deadlines, googleEvents);
  }, [events, deadlines, googleEvents]);

  // Filter items by category if selected
  const filteredItems = useMemo(() => {
    if (categoryFilter === "all") return unifiedItems;
    if (categoryFilter === "deadlines") {
      return unifiedItems.filter((i) => i.itemType === "deadline");
    }
    if (categoryFilter === "google") {
      return unifiedItems.filter((i) => i.itemType === "google" || i.isGoogleEvent);
    }
    return unifiedItems.filter(
      (i) => i.itemType === "event" && i.category === categoryFilter
    );
  }, [unifiedItems, categoryFilter]);

  // Current Month Matrix
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const monthMatrix = useMemo(() => {
    return getMonthMatrix(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  // Current Week Days
  const weekDays = useMemo(() => {
    return getWeekDays(currentDate);
  }, [currentDate]);

  // Date Navigation handlers
  const handlePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
    } else if (viewMode === "week") {
      const prevWeek = new Date(currentDate);
      prevWeek.setDate(currentDate.getDate() - 7);
      setCurrentDate(prevWeek);
    } else {
      const prevDay = new Date(currentDate);
      prevDay.setDate(currentDate.getDate() - 1);
      setCurrentDate(prevDay);
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    } else if (viewMode === "week") {
      const nextWeek = new Date(currentDate);
      nextWeek.setDate(currentDate.getDate() + 7);
      setCurrentDate(nextWeek);
    } else {
      const nextDay = new Date(currentDate);
      nextDay.setDate(currentDate.getDate() + 1);
      setCurrentDate(nextDay);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Event actions with two-way Google Calendar synchronization
  const handleSaveEvent = async (event: CalendarEvent, addToGoogleCalendar = false) => {
    if (!currentUser) return;
    const userUid =
      currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");

    let eventToSave = { ...event };
    const token = getGoogleAccessToken();

    // 1. If modifying a Google Calendar event
    if (editingEvent?.googleEventId || editingEvent?.id?.startsWith("gcal-")) {
      const gEventId = editingEvent.googleEventId || editingEvent.id.replace("gcal-", "");
      const calId = editingEvent.googleCalendarId || "primary";

      if (token) {
        try {
          const confirmed = window.confirm(
            `Update "${eventToSave.title}" in your Google Calendar as well?`
          );
          if (confirmed) {
            await updateGoogleCalendarEvent(token, calId, gEventId, eventToSave);
            eventToSave.isGoogleSynced = true;
          }
        } catch (err: any) {
          console.warn("Failed to update Google Calendar event:", err);
          setGoogleError(err);
        }
      }
    } else if (addToGoogleCalendar && googleMeta.isConnected) {
      // 2. Creating or syncing a DeadlineIQ event to Google Calendar
      if (token) {
        try {
          const calId = googleMeta.selectedCalendarIds[0] || "primary";
          const res = await createGoogleCalendarEvent(token, calId, eventToSave);
          eventToSave.googleEventId = res.id;
          eventToSave.googleCalendarId = calId;
          eventToSave.isGoogleSynced = true;
        } catch (err: any) {
          console.warn("Failed to export event to Google Calendar:", err);
          setGoogleError(err);
        }
      } else {
        setGoogleError({
          type: "expired",
          message: "Could not sync with Google Calendar: session expired. Please reconnect.",
        });
      }
    }

    // Save in native DeadlineIQ database
    // Don't save pure Google events into Firestore if they don't belong to DeadlineIQ native events,
    // or save only when user explicitly created them in DeadlineIQ
    if (!eventToSave.id.startsWith("gcal-")) {
      const exists = events.some((e) => e.id === eventToSave.id);
      if (exists) {
        setEvents((prev) => prev.map((e) => (e.id === eventToSave.id ? eventToSave : e)));
        await updateEvent(userUid, eventToSave.id, eventToSave, userUid);
      } else {
        setEvents((prev) => [eventToSave, ...prev]);
        await createEvent(userUid, eventToSave, userUid);
      }
    }

    // Refresh Google Calendar view if sync happened
    if (token && (addToGoogleCalendar || editingEvent?.googleEventId)) {
      syncGoogleCalendarEvents(token, googleMeta, currentDate).catch(() => {});
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!currentUser) return;
    const userUid =
      currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteEvent(userUid, id, userUid);
    } catch (err) {
      console.warn("Could not sync deleted event to cloud:", err);
    }
  };

  const handleToggleDeadline = async (deadlineId: string) => {
    if (!currentUser) return;
    const userUid =
      currentUser.uid || (currentUser.usn ? `usn_${currentUser.usn}` : "guest");
    const target = deadlines.find((d) => d.id === deadlineId);
    if (!target) return;
    const newCompleted = !target.completed;
    setDeadlines((prev) =>
      prev.map((d) => (d.id === deadlineId ? { ...d, completed: newCompleted } : d))
    );
    try {
      await updateDeadline(userUid, deadlineId, { completed: newCompleted }, userUid);
    } catch (err) {
      console.warn("Could not sync updated deadline to cloud:", err);
    }
  };

  const openNewEventModal = (dateStr?: string) => {
    setSelectedDateForNewEvent(dateStr || formatDateIso(currentDate));
    setEditingEvent(null);
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setSelectedDateForNewEvent(event.date);
    setIsEventModalOpen(true);
  };

  const handleItemClick = (item: UnifiedCalendarItem) => {
    setSelectedItemForDetails(item);
    setIsDetailsModalOpen(true);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 border border-border flex items-center justify-center">
            <Sparkles size={20} className="text-[#0284c7] dark:text-[#76d8fb] animate-pulse" />
          </div>
          <span className="text-xs font-mono text-text-secondary tracking-wider uppercase">
            Loading Calendar
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const currentDateIso = formatDateIso(currentDate);
  const currentDayOfWeekName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][currentDate.getDay()] as DayOfWeek;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden transition-colors duration-200">
      {/* Liquid background glow orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[10%] left-[10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-15 dark:opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(118, 216, 251, 0.35) 0%, rgba(20, 85, 140, 0.08) 70%, transparent 80%)",
          }}
        />
        <div
          className="absolute bottom-[-10%] right-[5%] w-[650px] h-[650px] rounded-full blur-[140px] opacity-10 dark:opacity-18"
          style={{
            background:
              "radial-gradient(circle, rgba(168, 149, 255, 0.3) 0%, rgba(60, 35, 120, 0.06) 70%, transparent 80%)",
          }}
        />
      </div>

      {/* Navigation Header */}
      <header className="relative z-20 w-full border-b border-border bg-surface/85 backdrop-blur-2xl shadow-sm dark:shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-[1376px] mx-auto px-3 sm:px-6 md:px-8 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/dashboard"
              className="h-9 inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all shadow-xs active:scale-95 flex-shrink-0"
              title="Return to Dashboard"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <ArrowLeft size={16} strokeWidth={1.8} />
              </span>
              <span className="hidden xs:inline">Dashboard</span>
            </Link>

            <div className="h-4 w-[1px] bg-border hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <CalendarDays size={18} strokeWidth={1.8} className="text-[#0284c7] dark:text-[#76d8fb]" />
              </span>
              <h1 className="text-sm sm:text-lg font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif]">
                Calendar
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* Theme Toggle */}
            <ThemeToggle className="h-9" />

            {/* Account / Profile Link */}
            <Link
              href="/account"
              className="h-9 inline-flex items-center gap-2 px-3 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated hover:border-blue-300 dark:hover:border-[#76d8fb]/40 text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
              title="Open Account Profile & Settings"
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name || "User"}
                  className="w-4 h-4 rounded-full object-cover border border-blue-400 dark:border-[#76d8fb]/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User size={14} className="text-blue-600 dark:text-[#76d8fb]" />
              )}
              <span className="hidden sm:inline font-medium truncate max-w-[110px]">
                {currentUser?.name || "Profile"}
              </span>
            </Link>

            {/* Google Calendar Connect/Status Button */}
            {googleMeta.isConnected ? (
              <button
                onClick={() => setIsGoogleModalOpen(true)}
                className="hidden sm:inline-flex h-9 items-center gap-2 px-3.5 rounded-full border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-xs font-mono text-sky-700 dark:text-[#93bbf8] transition-all cursor-pointer shadow-[0_0_12px_rgba(66,133,244,0.15)] flex-shrink-0"
                title="Google Calendar connected — click to manage or sync"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    googleSyncStatus === "expired" || googleSyncStatus === "error"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-[#059669] dark:bg-[#75d5b0]"
                  }`}
                />
                <span>Google Calendar</span>
                <span className="text-[10px] opacity-75">
                  {googleSyncStatus === "syncing" ? "Syncing..." : "Connected"}
                </span>
              </button>
            ) : (
              <button
                onClick={handleConnectGoogleCalendar}
                className="hidden lg:inline-flex h-9 items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated hover:border-[#4285F4]/40 text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer flex-shrink-0 shadow-xs"
                title="Connect Google Calendar to sync events"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4H19ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"
                    fill="#4285F4"
                  />
                  <path d="M7 12H12V17H7V12Z" fill="#34A853" />
                </svg>
                <span>Connect Google Calendar</span>
              </button>
            )}

            {/* My Timetable Button */}
            <button
              onClick={() => setIsTimetableModalOpen(true)}
              className="hidden md:inline-flex h-9 items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
              title="Open Weekly Timetable"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <CalendarIcon size={16} strokeWidth={1.8} className="text-[#0284c7] dark:text-[#76d8fb]" />
              </span>
              <span>My Timetable</span>
            </button>

            {/* My Exams Button */}
            <Link
              href="/dashboard?modal=exams"
              className="hidden md:inline-flex h-9 items-center gap-2 px-3.5 rounded-full border border-slate-200/85 dark:border-border bg-white dark:bg-surface hover:bg-slate-50 dark:hover:bg-surface-elevated text-xs font-mono text-slate-700 dark:text-text-secondary hover:text-slate-900 dark:hover:text-text-primary transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
              title="Open Exam Schedule"
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <GraduationCap size={16} strokeWidth={1.8} className="text-amber-600 dark:text-[#fbaf72]" />
              </span>
              <span>My Exams</span>
            </Link>

            <button
              onClick={() => openNewEventModal()}
              className="h-9 inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 rounded-xl border border-primary/40 bg-gradient-to-r from-sky-500 to-sky-600 dark:from-[#8be0f8] dark:to-[#60caea] hover:brightness-105 text-white dark:text-[#061520] font-semibold text-xs transition-all shadow-xs active:scale-95 cursor-pointer flex-shrink-0"
            >
              <Plus size={15} />
              <span>Add Event</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-[1376px] w-full mx-auto px-4 sm:px-8 pt-6 pb-28 md:py-6 space-y-5">
        
        {/* Friendly Google Calendar Status / Error Banner */}
        {googleError && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs backdrop-blur-xl">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-medium">{googleError.message}</span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-300/70 ml-1.5">
                  (Fix: View{" "}
                  <Link href="/account" className="underline hover:text-amber-900 dark:hover:text-white cursor-pointer">
                    Google Setup Check in Settings
                  </Link>
                  )
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
              <button
                type="button"
                onClick={handleConnectGoogleCalendar}
                className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-900 dark:text-amber-100 text-xs font-medium transition-colors cursor-pointer"
              >
                {googleError.type === "expired" || !googleMeta.isConnected ? "Reconnect" : "Retry"}
              </button>
              <button
                type="button"
                onClick={() => setGoogleError(null)}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Top Controls Bar: Month Nav + View Switcher + Category Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-3xl border border-border bg-surface/85 backdrop-blur-xl shadow-sm dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          {/* Navigation Month / Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-2xl border border-border">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-xl hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleToday}
                className="px-3 py-1 rounded-xl text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-xl hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Next"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight font-['Space_Grotesk',sans-serif] min-w-[200px]">
              {viewMode === "day"
                ? currentDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : formatMonthYearTitle(currentYear, currentMonth)}
            </h2>
          </div>

          {/* Right Controls: View Switcher (Month/Week/Day) & Filter Pills */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-surface-subtle p-1 rounded-2xl border border-border text-xs font-mono">
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  viewMode === "month"
                    ? "bg-primary/15 border border-primary/40 text-primary dark:text-[#bae6fd] font-semibold shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  viewMode === "week"
                    ? "bg-primary/15 border border-primary/40 text-primary dark:text-[#bae6fd] font-semibold shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("day")}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  viewMode === "day"
                    ? "bg-primary/15 border border-primary/40 text-primary dark:text-[#bae6fd] font-semibold shadow-xs"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Day
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer border ${
                  categoryFilter === "all"
                    ? "bg-surface-elevated text-text-primary border-border shadow-xs font-medium"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                All
              </button>

              {EVENT_CATEGORIES.map((cat) => {
                const isSelected = categoryFilter === cat;
                const meta = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(isSelected ? "all" : cat)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer flex items-center gap-1 border ${
                      isSelected
                        ? `${meta.bgBadge} ${meta.borderColor} font-semibold shadow-xs`
                        : "border-transparent text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                    <span>{cat}</span>
                  </button>
                );
              })}

              <button
                onClick={() =>
                  setCategoryFilter(categoryFilter === "deadlines" ? "all" : "deadlines")
                }
                className={`px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer flex items-center gap-1 border ${
                  categoryFilter === "deadlines"
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-[#bae6fd] font-semibold"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                <Clock size={11} className="text-[#0284c7] dark:text-[#76d8fb]" />
                <span>Deadlines</span>
              </button>

              {/* Google Calendar Events Filter */}
              {googleMeta.isConnected && (
                <button
                  onClick={() =>
                    setCategoryFilter(categoryFilter === "google" ? "all" : "google")
                  }
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5 border ${
                    categoryFilter === "google"
                      ? "bg-[#4285F4]/20 border-[#4285F4]/40 text-[#4285F4] dark:text-[#93bbf8] font-semibold"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                  <span>Google Events</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 1. MONTH VIEW                                             */}
        {/* ========================================================= */}
        {viewMode === "month" && (
          <div className="rounded-3xl border border-border bg-surface/85 backdrop-blur-2xl p-3 sm:p-5 shadow-sm dark:shadow-2xl overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span className="text-purple-600 dark:text-[#a895ff]">Sat</span>
              <span className="text-amber-600 dark:text-[#fbaf72]">Sun</span>
            </div>

            {/* Month Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {monthMatrix.map((week, wIdx) =>
                week.map((cell, cIdx) => {
                  const dayItems = filteredItems.filter((i) => i.date === cell.dateStr);

                  return (
                    <div
                      key={`${wIdx}-${cIdx}`}
                      onClick={() => openNewEventModal(cell.dateStr)}
                      className={`min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group hover:border-primary/40 ${
                        cell.isToday
                          ? "border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(2,132,199,0.12)] dark:shadow-[0_0_20px_rgba(118,216,251,0.12)]"
                          : cell.isCurrentMonth
                          ? "border-border/60 bg-surface hover:bg-surface-elevated hover:shadow-xs"
                          : "border-border/20 bg-surface-subtle/30 opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* Day Number Header */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono font-semibold rounded-lg px-1.5 py-0.5 ${
                            cell.isToday
                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                              : cell.isCurrentMonth
                              ? "text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          {cell.dayNumber}
                        </span>

                        {dayItems.length > 0 && (
                          <span className="text-[10px] font-mono text-text-muted hidden sm:inline">
                            {dayItems.length}
                          </span>
                        )}
                      </div>

                      {/* Items Pills in Cell */}
                      <div className="space-y-1 my-1 overflow-hidden">
                        {dayItems.slice(0, 3).map((item) => {
                          const isDl = item.itemType === "deadline";
                          const isGcal = item.itemType === "google" || Boolean(item.isGoogleEvent);
                          const meta = CATEGORY_META[item.category] || CATEGORY_META.Other;

                          return (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleItemClick(item);
                              }}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono truncate transition-all flex items-center gap-1 border shadow-xs hover:brightness-125 ${
                                isGcal
                                  ? "bg-[#4285F4]/15 border-[#4285F4]/35 text-[#93bbf8]"
                                  : isDl
                                  ? "bg-[#76d8fb]/15 border-[#76d8fb]/35 text-[#bae6fd]"
                                  : `${meta.bgBadge} ${meta.borderColor}`
                              }`}
                              title={item.title}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  isGcal
                                    ? "bg-[#4285F4]"
                                    : isDl
                                    ? "bg-[#76d8fb]"
                                    : meta.dotColor
                                }`}
                              />
                              <span className="truncate">{item.title}</span>
                            </div>
                          );
                        })}

                        {dayItems.length > 3 && (
                          <div className="text-[9px] font-mono text-[#8ca0b8] pl-1">
                            +{dayItems.length - 3} more
                          </div>
                        )}
                      </div>

                      <div className="h-1" />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 2. WEEK VIEW                                              */}
        {/* ========================================================= */}
        {viewMode === "week" && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((dayCell) => {
              const dayItems = filteredItems.filter((i) => i.date === dayCell.dateStr);
              const dayName = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ][dayCell.date.getDay()] as DayOfWeek;

              // Classes for this day
              const classesForDay = timetable.filter((t) => t.day === dayName);

              return (
                <div
                  key={dayCell.dateStr}
                  className={`rounded-2xl p-3 sm:p-4 border transition-all flex flex-col justify-between ${
                    dayCell.isToday
                      ? "border-primary/50 bg-primary/10 shadow-[0_0_24px_rgba(2,132,199,0.12)] dark:shadow-[0_0_24px_rgba(118,216,251,0.1)]"
                      : "border-border/70 bg-surface/85 hover:bg-surface-elevated shadow-xs"
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border">
                      <div>
                        <span className="text-xs font-mono font-semibold text-text-muted uppercase block">
                          {dayName.slice(0, 3)}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-lg font-bold font-['Space_Grotesk',sans-serif] ${
                              dayCell.isToday ? "text-primary" : "text-text-primary"
                            }`}
                          >
                            {dayCell.dayNumber}
                          </span>
                          {dayCell.isToday && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-[#059669] dark:text-[#75d5b0] bg-emerald-500/15 border border-emerald-500/30 font-semibold">
                              TODAY
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-[10px] font-mono text-text-muted">
                        {dayItems.length + classesForDay.length} items
                      </span>
                    </div>

                    {/* Classes summary snippet */}
                    {classesForDay.length > 0 && (
                      <div className="mb-2.5 space-y-1">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 dark:text-[#75d5b0] block">
                          Classes ({classesForDay.length})
                        </span>
                        {classesForDay.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => setIsTimetableModalOpen(true)}
                            className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-800 dark:text-[#a7f3d0] flex items-center justify-between cursor-pointer hover:bg-emerald-500/20 transition-colors"
                          >
                            <span className="truncate">{c.subject}</span>
                            <span className="text-emerald-700 dark:text-[#86e2be] flex-shrink-0">
                              {c.startTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Events & Deadlines list */}
                    <div className="space-y-1.5">
                      {dayItems.length === 0 && classesForDay.length === 0 ? (
                        <div className="py-6 text-center text-xs font-mono text-text-muted">
                          Free day
                        </div>
                      ) : (
                        dayItems.map((item) => {
                          const isDl = item.itemType === "deadline";
                          const isGcal = item.itemType === "google" || Boolean(item.isGoogleEvent);
                          const meta =
                            CATEGORY_META[item.category] || CATEGORY_META.Other;

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleItemClick(item)}
                              className={`p-2 rounded-xl border text-xs font-mono cursor-pointer transition-all hover:scale-[1.01] ${
                                isGcal
                                  ? "bg-[#4285F4]/15 border-[#4285F4]/35 text-sky-800 dark:text-[#93bbf8]"
                                  : isDl
                                  ? "bg-sky-500/12 border-sky-500/30 text-sky-800 dark:text-[#bae6fd]"
                                  : `${meta.bgBadge} ${meta.borderColor}`
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <div className="flex items-center gap-1.5 truncate">
                                  {isGcal && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4] flex-shrink-0" />
                                  )}
                                  <span className="font-semibold truncate">
                                    {item.title}
                                  </span>
                                </div>
                                {isDl && <Clock size={11} className="text-[#0284c7] dark:text-[#76d8fb] flex-shrink-0" />}
                              </div>
                              <div className="flex items-center justify-between text-[10px] opacity-80">
                                <span>
                                  {item.allDay
                                    ? "All-day"
                                    : item.startTime
                                    ? formatTime12Hour(item.startTime)
                                    : ""}
                                </span>
                                {item.location && (
                                  <span className="truncate max-w-[80px]">
                                    {item.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openNewEventModal(dayCell.dateStr)}
                    className="mt-3 w-full py-1.5 rounded-xl border border-dashed border-border hover:border-primary/40 text-xs font-mono text-text-muted hover:text-primary flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Add</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. DAY VIEW                                               */}
        {/* ========================================================= */}
        {viewMode === "day" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* Left 8 Cols: Timeline and Scheduled Items */}
            <div className="lg:col-span-8 rounded-3xl border border-border bg-surface/85 backdrop-blur-2xl p-5 sm:p-7 shadow-sm dark:shadow-2xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <span className="text-[10px] font-mono tracking-wider uppercase text-primary block">
                    DAY HORIZON
                  </span>
                  <h3 className="text-xl font-semibold text-text-primary font-['Space_Grotesk',sans-serif]">
                    Schedule for {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </h3>
                </div>

                <button
                  onClick={() => openNewEventModal(currentDateIso)}
                  className="px-3.5 py-1.5 rounded-xl border border-primary/40 bg-primary/15 hover:bg-primary/25 text-primary text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Event for this Day</span>
                </button>
              </div>

              {/* Scheduled Classes from Timetable */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-[#75d5b0] mb-3 flex items-center gap-2">
                  <BookOpen size={13} />
                  <span>Scheduled Classes ({timetable.filter((t) => t.day === currentDayOfWeekName).length})</span>
                </h4>

                {timetable.filter((t) => t.day === currentDayOfWeekName).length === 0 ? (
                  <div className="p-4 rounded-xl border border-border/40 bg-surface-subtle/50 text-xs font-mono text-text-muted text-center">
                    No recurring classes scheduled on {currentDayOfWeekName}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {timetable
                      .filter((t) => t.day === currentDayOfWeekName)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((c) => (
                        <div
                          key={c.id}
                          onClick={() => setIsTimetableModalOpen(true)}
                          className="p-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.09] transition-all cursor-pointer shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-text-primary text-sm">
                              {c.subject}
                            </span>
                            <span className="text-xs font-mono text-emerald-600 dark:text-[#75d5b0]">
                              {formatTime12Hour(c.startTime)} – {formatTime12Hour(c.endTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-text-secondary mt-2 font-mono">
                            {c.room && (
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-emerald-500" />
                                <span>{c.room}</span>
                              </span>
                            )}
                            {c.instructor && (
                              <span className="flex items-center gap-1 text-sky-600 dark:text-[#93c5fd]">
                                <User size={11} className="text-primary" />
                                <span>{c.instructor}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Events & Deadlines for Today */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                  <CalendarDays size={13} />
                  <span>Calendar Events & Deadlines ({filteredItems.filter((i) => i.date === currentDateIso).length})</span>
                </h4>

                {filteredItems.filter((i) => i.date === currentDateIso).length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-surface-subtle/30">
                    <p className="text-sm text-text-muted">No events or deadlines for this day.</p>
                    <button
                      onClick={() => openNewEventModal(currentDateIso)}
                      className="mt-3 text-xs text-primary hover:underline font-mono inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={13} /> Add first event
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems
                      .filter((i) => i.date === currentDateIso)
                      .map((item) => {
                        const isDl = item.itemType === "deadline";
                        const isGcal = item.itemType === "google" || Boolean(item.isGoogleEvent);
                        const meta =
                          CATEGORY_META[item.category] || CATEGORY_META.Other;

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group hover:scale-[1.008] shadow-xs ${
                              isGcal
                                ? "border-[#4285F4]/40 bg-[#4285F4]/10 hover:bg-[#4285F4]/15 text-text-primary"
                                : isDl
                                ? "border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/15 text-text-primary"
                                : `${meta.borderColor} ${meta.bgBadge} hover:brightness-105`
                            }`}
                          >
                            <div className="flex items-center gap-3.5">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                  isGcal
                                    ? "bg-[#4285F4]/20 text-[#4285F4] dark:text-[#93bbf8]"
                                    : isDl
                                    ? "bg-sky-500/20 text-[#0284c7] dark:text-[#76d8fb]"
                                    : "bg-surface-elevated text-text-primary shadow-xs"
                                }`}
                              >
                                {isGcal ? (
                                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                                    <path
                                      d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4H19ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"
                                      fill="#4285F4"
                                    />
                                    <path d="M7 12H12V17H7V12Z" fill="#34A853" />
                                  </svg>
                                ) : isDl ? (
                                  <Clock size={16} />
                                ) : (
                                  <CalendarIcon size={16} />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-text-primary text-base">
                                    {item.title}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase ${
                                      isGcal
                                        ? "bg-[#4285F4]/20 text-[#4285F4] dark:text-[#93bbf8] border border-[#4285F4]/30 font-semibold"
                                        : isDl
                                        ? "bg-sky-500/20 text-sky-800 dark:text-[#bae6fd] border border-sky-500/30 font-bold"
                                        : `${meta.bgBadge} border ${meta.borderColor}`
                                    }`}
                                  >
                                    {isGcal ? "GOOGLE CALENDAR" : isDl ? "DEADLINE" : item.category}
                                  </span>
                                  {item.isGoogleSynced && !isGcal && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-[#4285F4]/15 text-[#4285F4] dark:text-[#93bbf8] border border-[#4285F4]/30">
                                      Synced
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary mt-1 font-mono">
                                  <span>
                                    {item.allDay
                                      ? "All-day event"
                                      : item.startTime
                                      ? `${formatTime12Hour(item.startTime)}${
                                          item.endTime ? ` – ${formatTime12Hour(item.endTime)}` : ""
                                        }`
                                      : "No specific time"}
                                  </span>
                                  {item.location && (
                                    <span className="flex items-center gap-1 text-text-muted">
                                      <MapPin size={11} className="text-[#0284c7] dark:text-[#76d8fb]" />
                                      <span>{item.location}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="text-xs font-mono text-text-muted group-hover:text-primary transition-colors">
                              View →
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 Cols: Quick Add & Category Legend */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 rounded-3xl border border-border bg-surface/85 backdrop-blur-2xl shadow-sm dark:shadow-2xl">
                <h4 className="text-sm font-semibold text-text-primary font-['Space_Grotesk',sans-serif] mb-3">
                  Event Categories
                </h4>
                <div className="space-y-2.5 text-xs font-mono">
                  {EVENT_CATEGORIES.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const count = events.filter((e) => e.category === cat).length;
                    return (
                      <div
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${meta.dotColor}`} />
                          <span className="text-text-secondary">{cat}</span>
                        </div>
                        <span className="text-text-muted">{count}</span>
                      </div>
                    );
                  })}
                  <div
                    onClick={() => setCategoryFilter("deadlines")}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-elevated transition-colors cursor-pointer border-t border-border pt-2 mt-2"
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-[#0284c7] dark:text-[#76d8fb]" />
                      <span className="text-sky-700 dark:text-[#bae6fd]">Deadlines</span>
                    </div>
                    <span className="text-text-muted">{deadlines.length}</span>
                  </div>

                  {googleMeta.isConnected && (
                    <div
                      onClick={() => setCategoryFilter("google")}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-elevated transition-colors cursor-pointer border-t border-border pt-2 mt-1"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]" />
                        <span className="text-sky-700 dark:text-[#93bbf8]">Google Events</span>
                      </div>
                      <span className="text-text-muted">{googleEvents.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR                       */}
      {/* ================================================== */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#faf8f5]/95 dark:bg-[#0c101a]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-white/[0.08] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_25px_rgba(0,0,0,0.4)] pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 px-3 transition-colors"
      >
        <div className="grid grid-cols-4 items-center gap-1 max-w-md mx-auto">
          {/* 1. Home / Dashboard */}
          <Link
            href="/dashboard"
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <LayoutDashboard size={18} strokeWidth={1.8} />
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Home</span>
          </Link>

          {/* 2. My Timetable */}
          <button
            type="button"
            onClick={() => setIsTimetableModalOpen(true)}
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <CalendarIcon size={18} strokeWidth={1.8} className="text-[#0284c7] dark:text-[#76d8fb]" />
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Timetable</span>
          </button>

          {/* 3. My Exams */}
          <Link
            href="/dashboard?modal=exams"
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all cursor-pointer active:scale-95 group relative"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 relative" aria-hidden="true">
              <GraduationCap size={18} strokeWidth={1.8} className="text-amber-600 dark:text-[#fbaf72]" />
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Exams</span>
          </Link>

          {/* 4. Calendar (Active) */}
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex flex-col items-center justify-center min-h-[48px] py-1 px-2 rounded-xl text-purple-600 dark:text-[#a895ff] transition-all cursor-pointer active:scale-95 group relative"
          >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 relative" aria-hidden="true">
              <CalendarDays size={18} strokeWidth={2} className="text-[#7c3aed] dark:text-[#a895ff]" />
              {events.length > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[8px] font-mono font-bold bg-purple-500 text-white leading-none">
                  {events.length}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium tracking-tight mt-0.5">Calendar</span>
          </button>
        </div>
      </nav>

      {/* Event Add/Edit Modal */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSaveEvent={handleSaveEvent}
        onDeleteEvent={handleDeleteEvent}
        initialDate={selectedDateForNewEvent}
        editingEvent={editingEvent}
        isGoogleConnected={googleMeta.isConnected}
      />

      {/* Event / Deadline Details Modal */}
      <EventDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        item={selectedItemForDetails}
        onEditEvent={(ev) => openEditEventModal(ev)}
        onDeleteEvent={handleDeleteEvent}
        onToggleDeadline={handleToggleDeadline}
        onDeleteGoogleEvent={handleDeleteGoogleCalendarEvent}
      />

      {/* Timetable Modal */}
      <TimetableModal
        isOpen={isTimetableModalOpen}
        onClose={() => setIsTimetableModalOpen(false)}
        timetable={timetable}
        onUpdateTimetable={(entries) => {
          setTimetable(entries);
        }}
      />

      {/* Google Calendar Settings & Sync Modal */}
      <GoogleCalendarModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        meta={googleMeta}
        syncStatus={googleSyncStatus}
        lastError={googleError}
        onConnect={handleConnectGoogleCalendar}
        onDisconnect={handleDisconnectGoogleCalendar}
        onSyncNow={handleSyncNow}
        onToggleCalendar={handleToggleCalendar}
        isConfigured={isGoogleConfigured}
      />
    </div>
  );
}
